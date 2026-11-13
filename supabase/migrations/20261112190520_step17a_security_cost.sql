-- Step 17A: security audit fixes and cost-field protection

-- 1) Trigger / event-trigger helpers must not be callable by any client role.
do $mig$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('rls_auto_enable', 'prevent_business_id_change')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $mig$;

-- 2) Cost gates: return the cost only when the caller has finance.view, otherwise null.
create function public.cost_gate_product(p_business_id uuid, p_product_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $fn$
  select p.cost_price
  from public.products p
  where p.business_id = p_business_id and p.id = p_product_id
    and public.has_permission(p_business_id, 'finance.view');
$fn$;

-- Purchase screens also show a product's current cost to people who manage purchases.
create function public.po_cost_gate_product(p_business_id uuid, p_product_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $fn$
  select p.cost_price
  from public.products p
  where p.business_id = p_business_id and p.id = p_product_id
    and (public.has_permission(p_business_id, 'finance.view')
         or public.has_permission(p_business_id, 'purchases.manage'));
$fn$;

create function public.cost_gate_sale(p_business_id uuid, p_sale_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $fn$
  select s.cost_total
  from public.sales s
  where s.business_id = p_business_id and s.id = p_sale_id
    and public.has_permission(p_business_id, 'finance.view');
$fn$;

create function public.cost_gate_movement(p_business_id uuid, p_movement_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $fn$
  select m.unit_cost
  from public.stock_movements m
  where m.business_id = p_business_id and m.id = p_movement_id
    and public.has_permission(p_business_id, 'finance.view');
$fn$;

-- Bulk readers for table-based screens (product form, CSV exports).
create function public.get_product_costs(p_business_id uuid, p_product_ids uuid[])
returns table (product_id uuid, cost_price numeric)
language plpgsql stable security definer set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if not public.has_permission(p_business_id, 'finance.view') then
    raise exception 'You do not have permission to view cost prices.' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_product_ids, '{}')) > 2000 then
    raise exception 'Too many products requested at once.' using errcode = '22023';
  end if;
  return query
    select p.id, p.cost_price
    from public.products p
    where p.business_id = p_business_id and p.id = any (p_product_ids);
end $fn$;

create function public.get_sale_costs(p_business_id uuid, p_sale_ids uuid[])
returns table (sale_id uuid, cost_total numeric)
language plpgsql stable security definer set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if not public.has_permission(p_business_id, 'finance.view') then
    raise exception 'You do not have permission to view cost of goods.' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_sale_ids, '{}')) > 2000 then
    raise exception 'Too many sales requested at once.' using errcode = '22023';
  end if;
  return query
    select s.id, s.cost_total
    from public.sales s
    where s.business_id = p_business_id and s.id = any (p_sale_ids);
end $fn$;

revoke all on function public.cost_gate_product(uuid, uuid) from public, anon, authenticated;
revoke all on function public.po_cost_gate_product(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cost_gate_sale(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cost_gate_movement(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_product_costs(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.get_sale_costs(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.cost_gate_product(uuid, uuid) to authenticated;
grant execute on function public.po_cost_gate_product(uuid, uuid) to authenticated;
grant execute on function public.cost_gate_sale(uuid, uuid) to authenticated;
grant execute on function public.cost_gate_movement(uuid, uuid) to authenticated;
grant execute on function public.get_product_costs(uuid, uuid[]) to authenticated;
grant execute on function public.get_sale_costs(uuid, uuid[]) to authenticated;

-- 3) Views: same columns, same order, cost column now comes from the gates.
create or replace view public.products_with_status with (security_invoker = true) as
select p.id, p.business_id, p.category_id, p.supplier_id, p.name, p.sku, p.barcode,
       p.description, p.unit,
       (public.cost_gate_product(p.business_id, p.id))::numeric(14,2) as cost_price,
       p.selling_price, p.quantity_on_hand, p.min_stock_level, p.image_path,
       p.is_active, p.created_at, p.updated_at, p.deleted_at,
       case when p.quantity_on_hand <= 0 then 'out'::text
            when p.min_stock_level > 0 and p.quantity_on_hand <= p.min_stock_level then 'low'::text
            else 'ok'::text end as stock_status
from public.products p
where p.deleted_at is null;

create or replace view public.stock_movements_with_details with (security_invoker = true) as
select m.id, m.business_id, m.product_id, p.name as product_name, p.sku as product_sku,
       p.unit as product_unit, p.deleted_at as product_deleted_at, m.movement_type,
       m.quantity_change, m.balance_after,
       (public.cost_gate_movement(m.business_id, m.id))::numeric(14,2) as unit_cost,
       m.reference_type, m.reference_id, m.note, m.created_by,
       pr.full_name as created_by_name, m.created_at
from public.stock_movements m
join public.products p on p.business_id = m.business_id and p.id = m.product_id
left join public.profiles pr on pr.id = m.created_by;

-- The two long views are patched from their live definition; the DO block raises if the text is not what is expected.
do $mig$
declare v_def text; v_new text; v_n integer;
begin
  perform set_config('search_path', 'public, pg_catalog', true);

  v_def := pg_get_viewdef('public.sales_with_details'::regclass, false);
  select count(*) into v_n from regexp_matches(v_def, '\ms\.cost_total\M', 'g');
  if v_n <> 1 then
    raise exception 'sales_with_details: expected 1 use of s.cost_total, found %', v_n;
  end if;
  v_new := regexp_replace(v_def, '\ms\.cost_total\M',
    '(public.cost_gate_sale(s.business_id, s.id))::numeric(14,2) AS cost_total');
  v_new := regexp_replace(v_new, ';\s*$', '');
  execute 'create or replace view public.sales_with_details with (security_invoker = true) as ' || v_new;

  v_def := pg_get_viewdef('public.purchase_order_items_with_details'::regclass, false);
  select count(*) into v_n from regexp_matches(v_def, '\mp\.cost_price\M', 'g');
  if v_n <> 1 then
    raise exception 'purchase_order_items_with_details: expected 1 use of p.cost_price, found %', v_n;
  end if;
  v_new := replace(v_def, 'p.cost_price AS current_cost_price',
    '(public.po_cost_gate_product(p.business_id, p.id))::numeric(14,2) AS current_cost_price');
  if v_new = v_def then
    raise exception 'purchase_order_items_with_details: current_cost_price pattern not found';
  end if;
  v_new := regexp_replace(v_new, ';\s*$', '');
  execute 'create or replace view public.purchase_order_items_with_details with (security_invoker = true) as ' || v_new;
end $mig$;

revoke all on public.products_with_status, public.stock_movements_with_details,
  public.sales_with_details, public.purchase_order_items_with_details
  from public, anon, authenticated;
grant select on public.products_with_status, public.stock_movements_with_details,
  public.sales_with_details, public.purchase_order_items_with_details to authenticated;

-- 4) Clients can no longer read the four cost columns from the tables (writes stay as they were).
do $mig$
declare r record; v_cols text;
begin
  for r in
    select * from (values
      ('products', 'cost_price'),
      ('sales', 'cost_total'),
      ('sale_items', 'unit_cost'),
      ('stock_movements', 'unit_cost')
    ) as t(tbl, col)
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
    where a.attrelid = format('public.%I', r.tbl)::regclass
      and a.attnum > 0 and not a.attisdropped and a.attname <> r.col;
    execute format('revoke select on public.%I from authenticated', r.tbl);
    execute format('grant select (%s) on public.%I to authenticated', v_cols, r.tbl);
  end loop;
end $mig$;

-- 5) categories: column-level writes only, no hard delete (rules 2 and 10).
revoke delete, insert, update on public.categories from authenticated;
grant insert (business_id, name, is_active) on public.categories to authenticated;
grant update (name, is_active) on public.categories to authenticated;