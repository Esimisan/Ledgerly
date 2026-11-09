-- bulk product import.
-- Rows arrive as a JSON array of objects whose values are raw cell TEXT:
-- name, sku, barcode, description, unit, category, supplier, cost_price,
-- selling_price, opening_stock, min_stock_level. Row numbers are 1-based data rows.

-- Internal: strips spaces, commas and the naira sign; '' becomes NULL.
create or replace function public.import_clean(p text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select nullif(regexp_replace(btrim(coalesce(p, '')), '[' || chr(8358) || ',\s]', '', 'g'), '')
$fn$;

-- Internal: validates the shape of the rows array and returns its length.
create or replace function public.import_check_rows(p_rows jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Send the rows as a list.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then
    raise exception 'The file has no rows to import.' using errcode = '22023';
  end if;
  if v_n > 2000 then
    raise exception 'An import can have at most 2,000 rows. Split the file and import it in parts.'
      using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) e where jsonb_typeof(e) <> 'object') then
    raise exception 'Every row must be an object of column values.' using errcode = '22023';
  end if;
  return v_n;
end
$fn$;

-- Internal: the ONE place the import rules live. Used by the preview and the commit.
-- action: create | update | unchanged | error. No access check here (no client grant).
create or replace function public.product_import_plan(p_business_id uuid, p_rows jsonb)
returns table (
  row_no integer,
  name text,
  sku text,
  barcode text,
  description text,
  unit text,
  category_name text,
  supplier_name text,
  category_id uuid,
  supplier_id uuid,
  cost_price numeric,
  selling_price numeric,
  opening_stock numeric,
  min_stock_level numeric,
  product_id uuid,
  action text,
  message text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with src as (
    select t.ord::integer as row_no,
           nullif(btrim(t.r ->> 'name'), '') as name,
           nullif(btrim(t.r ->> 'sku'), '') as sku,
           nullif(btrim(t.r ->> 'barcode'), '') as barcode,
           nullif(btrim(t.r ->> 'description'), '') as description,
           nullif(btrim(t.r ->> 'unit'), '') as unit,
           nullif(btrim(t.r ->> 'category'), '') as category_name,
           nullif(btrim(t.r ->> 'supplier'), '') as supplier_name,
           public.import_clean(t.r ->> 'cost_price') as cost_raw,
           public.import_clean(t.r ->> 'selling_price') as price_raw,
           public.import_clean(t.r ->> 'opening_stock') as stock_raw,
           public.import_clean(t.r ->> 'min_stock_level') as min_raw
    from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
  ),
  j as (
    select s.*,
           p.id as pid, p.deleted_at as pdeleted, p.name as p_name, p.barcode as p_barcode,
           p.description as p_desc, p.unit as p_unit, p.cost_price as p_cost,
           p.selling_price as p_price, p.min_stock_level as p_min,
           p.category_id as p_cat, p.supplier_id as p_sup,
           c.id as cid, sp.id as sid,
           first_value(s.row_no) over (partition by lower(s.sku) order by s.row_no) as first_row
    from src s
    left join public.products p
      on p.business_id = p_business_id and s.sku is not null and lower(p.sku) = lower(s.sku)
    left join public.categories c
      on c.business_id = p_business_id and s.category_name is not null
     and lower(c.name) = lower(s.category_name)
    left join public.suppliers sp
      on sp.business_id = p_business_id and s.supplier_name is not null
     and lower(btrim(sp.name)) = lower(s.supplier_name)
  ),
  e as (
    select j.*,
           array_remove(array[
             case when j.name is null then 'Name is required.' end,
             case when char_length(j.name) > 200 then 'Name is longer than 200 characters.' end,
             case when char_length(j.sku) > 64 then 'SKU is longer than 64 characters.' end,
             case when j.unit is not null and (char_length(j.unit) > 20 or j.unit ~ '[0-9]')
                  then 'Unit must be 1 to 20 characters with no digits (for example pcs, kg, box).' end,
             case when j.cost_raw is not null and j.cost_raw !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
                  then 'Cost price must be a number, zero or more, with at most 2 decimals.' end,
             case when j.price_raw is not null and j.price_raw !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
                  then 'Selling price must be a number, zero or more, with at most 2 decimals.' end,
             case when j.stock_raw is not null and j.stock_raw !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
                  then 'Opening stock must be a number, zero or more, with at most 3 decimals.' end,
             case when j.min_raw is not null and j.min_raw !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
                  then 'Minimum stock level must be a number, zero or more, with at most 3 decimals.' end,
             case when j.sku is not null and j.row_no <> j.first_row
                  then 'Duplicate SKU: it is already used on row ' || j.first_row || '.' end,
             case when j.pid is not null and j.pdeleted is not null
                  then 'This SKU belongs to a deleted product and cannot be reused.' end
           ], null) as errs,
           array_remove(array[
             case when j.sku is null
                  then 'No SKU, so this row always creates a new product.' end,
             case when j.pid is not null and j.pdeleted is null
                       and coalesce(case when j.stock_raw ~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
                                         then j.stock_raw::numeric end, 0) > 0
                  then 'Opening stock is ignored for an existing product. Use a stock adjustment instead.' end
           ], null) as warns,
           case when j.cost_raw ~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then j.cost_raw::numeric end as nc,
           case when j.price_raw ~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then j.price_raw::numeric end as np,
           case when j.stock_raw ~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' then j.stock_raw::numeric end as ns,
           case when j.min_raw ~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' then j.min_raw::numeric end as nm
    from j
  )
  select e.row_no, e.name, e.sku, e.barcode, e.description, e.unit,
         e.category_name, e.supplier_name, e.cid, e.sid,
         e.nc, e.np, e.ns, e.nm,
         case when e.pdeleted is null then e.pid end,
         case
           when cardinality(e.errs) > 0 then 'error'
           when e.pid is null then 'create'
           when e.name = e.p_name
                and (e.barcode is null or coalesce(e.barcode = e.p_barcode, false))
                and (e.description is null or coalesce(e.description = e.p_desc, false))
                and (e.unit is null or coalesce(e.unit = e.p_unit, false))
                and (e.nc is null or e.nc = e.p_cost)
                and (e.np is null or e.np = e.p_price)
                and (e.nm is null or e.nm = e.p_min)
                and (e.category_name is null or coalesce(e.cid = e.p_cat, false))
                and (e.supplier_name is null or coalesce(e.sid = e.p_sup, false))
             then 'unchanged'
           else 'update'
         end,
         nullif(array_to_string(
           case when cardinality(e.errs) > 0 then e.errs else e.warns end, ' '), '')
  from e
$fn$;

-- Preview (dry run). Writes nothing.
create or replace function public.validate_product_import(
  p_business_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_n integer;
begin
  if p_business_id is null or not public.is_member(p_business_id) then
    raise exception 'You do not have access to this business.' using errcode = '42501';
  end if;
  if not public.has_permission(p_business_id, 'import.run') then
    raise exception 'You do not have permission to import products.' using errcode = '42501';
  end if;
  v_n := public.import_check_rows(p_rows);

  return (
    with p as (select * from public.product_import_plan(p_business_id, p_rows))
    select jsonb_build_object(
      'total_rows', v_n,
      'counts', jsonb_build_object(
        'create', count(*) filter (where p.action = 'create'),
        'update', count(*) filter (where p.action = 'update'),
        'unchanged', count(*) filter (where p.action = 'unchanged'),
        'error', count(*) filter (where p.action = 'error')),
      'opening_stock_rows',
        count(*) filter (where p.action = 'create' and coalesce(p.opening_stock, 0) > 0),
      'new_categories', coalesce((
        select jsonb_agg(x.nm order by lower(x.nm))
        from (
          select distinct on (lower(q.category_name)) q.category_name as nm
          from p q
          where q.action in ('create', 'update')
            and q.category_name is not null and q.category_id is null
          order by lower(q.category_name), q.row_no
        ) x), '[]'::jsonb),
      'new_suppliers', coalesce((
        select jsonb_agg(x.nm order by lower(x.nm))
        from (
          select distinct on (lower(q.supplier_name)) q.supplier_name as nm
          from p q
          where q.action in ('create', 'update')
            and q.supplier_name is not null and q.supplier_id is null
          order by lower(q.supplier_name), q.row_no
        ) x), '[]'::jsonb),
      'rows', coalesce(jsonb_agg(
        jsonb_build_object('row', p.row_no, 'name', p.name, 'sku', p.sku,
                           'action', p.action, 'message', p.message)
        order by p.row_no), '[]'::jsonb)
    )
    from p
  );
end
$fn$;

-- Commit. One transaction. p_options: { "skip_invalid": true } imports only the valid rows.
create or replace function public.import_products(
  p_business_id uuid,
  p_file_name text,
  p_rows jsonb,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_n integer;
  v_skip boolean := coalesce((p_options ->> 'skip_invalid')::boolean, false);
  v_create integer;
  v_update integer;
  v_unch integer;
  v_err integer;
  v_stock_rows integer;
  v_newcat integer := 0;
  v_newsup integer := 0;
  v_stock integer := 0;
  v_errors jsonb;
  v_pid uuid;
  v_job uuid;
  rec record;
begin
  if p_business_id is null or not public.is_member(p_business_id) then
    raise exception 'You do not have access to this business.' using errcode = '42501';
  end if;
  if not public.has_permission(p_business_id, 'import.run') then
    raise exception 'You do not have permission to import products.' using errcode = '42501';
  end if;
  v_n := public.import_check_rows(p_rows);

  select count(*) filter (where q.action = 'create'),
         count(*) filter (where q.action = 'update'),
         count(*) filter (where q.action = 'unchanged'),
         count(*) filter (where q.action = 'error'),
         count(*) filter (where q.action = 'create' and coalesce(q.opening_stock, 0) > 0)
    into v_create, v_update, v_unch, v_err, v_stock_rows
  from public.product_import_plan(p_business_id, p_rows) q;

  if v_err > 0 and not v_skip then
    raise exception '% row(s) have errors. Fix the file, or choose to import only the valid rows.', v_err
      using errcode = '22023';
  end if;
  if v_create + v_update + v_unch = 0 then
    raise exception 'There are no valid rows to import.' using errcode = '22023';
  end if;
  if v_stock_rows > 0 and not public.has_permission(p_business_id, 'inventory.adjust') then
    raise exception 'Opening stock needs permission to change stock. Remove the opening_stock column or ask a manager to import.'
      using errcode = '42501';
  end if;

  -- Missing categories and suppliers first, so the plan below resolves their ids.
  insert into public.categories (business_id, name)
  select p_business_id, x.nm
  from (
    select distinct on (lower(q.category_name)) q.category_name as nm
    from public.product_import_plan(p_business_id, p_rows) q
    where q.action in ('create', 'update')
      and q.category_name is not null and q.category_id is null
    order by lower(q.category_name), q.row_no
  ) x
  on conflict do nothing;
  get diagnostics v_newcat = row_count;

  insert into public.suppliers (business_id, name)
  select p_business_id, x.nm
  from (
    select distinct on (lower(q.supplier_name)) q.supplier_name as nm
    from public.product_import_plan(p_business_id, p_rows) q
    where q.action in ('create', 'update')
      and q.supplier_name is not null and q.supplier_id is null
    order by lower(q.supplier_name), q.row_no
  ) x
  on conflict do nothing;
  get diagnostics v_newsup = row_count;

  for rec in
    select * from public.product_import_plan(p_business_id, p_rows) q
    where q.action in ('create', 'update')
    order by q.row_no
  loop
    if rec.action = 'create' then
      insert into public.products (
        business_id, name, sku, barcode, description, unit,
        cost_price, selling_price, min_stock_level, category_id, supplier_id)
      values (
        p_business_id, rec.name, rec.sku, rec.barcode, rec.description,
        coalesce(rec.unit, 'pcs'),
        coalesce(rec.cost_price, 0), coalesce(rec.selling_price, 0),
        coalesce(rec.min_stock_level, 0), rec.category_id, rec.supplier_id)
      returning id into v_pid;

      if coalesce(rec.opening_stock, 0) > 0 then
        perform public.apply_stock_change(
          p_business_id, v_pid, 'opening_stock', rec.opening_stock,
          rec.cost_price, 'Opening stock (import)');
        v_stock := v_stock + 1;
      end if;
    else
      update public.products p
         set name = rec.name,
             barcode = coalesce(rec.barcode, p.barcode),
             description = coalesce(rec.description, p.description),
             unit = coalesce(rec.unit, p.unit),
             cost_price = coalesce(rec.cost_price, p.cost_price),
             selling_price = coalesce(rec.selling_price, p.selling_price),
             min_stock_level = coalesce(rec.min_stock_level, p.min_stock_level),
             category_id = coalesce(rec.category_id, p.category_id),
             supplier_id = coalesce(rec.supplier_id, p.supplier_id)
       where p.business_id = p_business_id and p.id = rec.product_id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('row', x.row_no, 'message', x.message)
                            order by x.row_no), '[]'::jsonb)
    into v_errors
  from (
    select q.row_no, q.message
    from public.product_import_plan(p_business_id, p_rows) q
    where q.action = 'error'
    order by q.row_no
    limit 100
  ) x;

  insert into public.import_jobs (
    business_id, kind, file_name, status, total_rows,
    succeeded_rows, failed_rows, errors, completed_at)
  values (
    p_business_id, 'products', left(nullif(btrim(p_file_name), ''), 200), 'completed', v_n,
    v_create + v_update + v_unch, v_err, v_errors, now())
  returning id into v_job;

  return jsonb_build_object(
    'job_id', v_job,
    'total_rows', v_n,
    'created', v_create,
    'updated', v_update,
    'unchanged', v_unch,
    'skipped_errors', v_err,
    'stock_entries', v_stock,
    'new_categories', v_newcat,
    'new_suppliers', v_newsup);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Grants: the three internal helpers get nothing; only the two entry points are open.
-- ---------------------------------------------------------------------------
revoke all on function public.import_clean(text) from public, anon, authenticated;
revoke all on function public.import_check_rows(jsonb) from public, anon, authenticated;
revoke all on function public.product_import_plan(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.validate_product_import(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.import_products(uuid, text, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.validate_product_import(uuid, jsonb) to authenticated;
grant execute on function public.import_products(uuid, text, jsonb, jsonb) to authenticated;