-- 1) Marker for products removed from the business but kept for history.
--    products uses column-level grants and none are given for this column,
--    so the client can never write it; only delete_product() does.
alter table public.products add column if not exists deleted_at timestamptz;

-- 2) A deleted product frees its SKU for reuse.
drop index if exists public.products_business_sku_uniq;
create unique index products_business_sku_uniq
  on public.products (business_id, lower(sku))
  where sku is not null and deleted_at is null;

-- 3) The catalogue view hides deleted products. Rebuilt (not replaced) because p.* gains a column.
drop view if exists public.products_with_status;
create view public.products_with_status
with (security_invoker = true) as
select
  p.*,
  case
    when p.quantity_on_hand <= 0 then 'out'
    when p.min_stock_level > 0 and p.quantity_on_hand <= p.min_stock_level then 'low'
    else 'ok'
  end as stock_status
from public.products p
where p.deleted_at is null;

revoke all on public.products_with_status from public, anon, authenticated;
grant select on public.products_with_status to authenticated;

-- 4) The client can never DELETE products directly. Deleting goes through delete_product().
revoke delete on public.products from anon, authenticated;

-- 5) What would deleting this product affect? Owner only.
--    Finds every table with a foreign key to products(id) from the system catalogue,
--    so tables added in later steps are counted automatically.
create or replace function public.product_usage(p_business_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n bigint;
  total bigint := 0;
  refs jsonb := '{}'::jsonb;
  qty numeric;
  unit_name text;
  tbl text;
begin
  if not public.has_role(p_business_id, array['owner']::public.business_role[]) then
    raise exception 'Only the business owner can do this.' using errcode = '42501';
  end if;

  select p.quantity_on_hand, p.unit into qty, unit_name
  from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null;
  if not found then
    raise exception 'Product not found.' using errcode = 'P0002';
  end if;

  for r in
    select distinct c.conrelid::regclass::text as tbl, a.attname::text as col
    from pg_constraint c
    cross join lateral unnest(c.conkey, c.confkey) as k(attnum, fattnum)
    join pg_attribute a  on a.attrelid  = c.conrelid  and a.attnum  = k.attnum
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.fattnum
    where c.contype = 'f'
      and c.confrelid = 'public.products'::regclass
      and fa.attname = 'id'
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col)
      into n using p_product_id;
    if n > 0 then
      tbl := replace(r.tbl, 'public.', '');
      refs := refs || jsonb_build_object(tbl, coalesce((refs ->> tbl)::bigint, 0) + n);
      total := total + n;
    end if;
  end loop;

  return jsonb_build_object(
    'quantity_on_hand', qty, 'unit', unit_name, 'references', refs, 'total', total
  );
end;
$$;

-- 6) Delete a product. Owner only. Never used -> erased. Has history -> removed going forward, history kept.
create or replace function public.delete_product(p_business_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  info jsonb;
  img text;
begin
  if not public.has_role(p_business_id, array['owner']::public.business_role[]) then
    raise exception 'Only the business owner can do this.' using errcode = '42501';
  end if;

  -- Lock the row first: nothing can start referencing it between counting and deleting.
  select p.image_path into img
  from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if not found then
    raise exception 'Product not found.' using errcode = 'P0002';
  end if;

  info := public.product_usage(p_business_id, p_product_id);

  if (info ->> 'total')::bigint = 0 then
    delete from public.products where id = p_product_id and business_id = p_business_id;
    return jsonb_build_object('result', 'deleted', 'image_path', img);
  end if;

  update public.products
     set deleted_at = now(), is_active = false
   where id = p_product_id and business_id = p_business_id;
  return jsonb_build_object('result', 'archived', 'image_path', null);
end;
$$;

revoke all on function public.product_usage(uuid, uuid) from public, anon;
revoke all on function public.delete_product(uuid, uuid) from public, anon;
grant execute on function public.product_usage(uuid, uuid) to authenticated;
grant execute on function public.delete_product(uuid, uuid) to authenticated;