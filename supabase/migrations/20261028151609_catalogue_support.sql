-- 1) Categories: soft delete, like everything else ("nothing is hard-deleted").
alter table public.categories
  add column if not exists is_active boolean not null default true;

-- Harmless if table-level grants already cover it; explicit so the new column is writable.
grant insert (is_active), update (is_active) on public.categories to authenticated;

-- 2) Uniqueness inside one business, case-insensitive.
create unique index if not exists categories_business_name_uniq
  on public.categories (business_id, lower(name));

create unique index if not exists products_business_sku_uniq
  on public.products (business_id, lower(sku))
  where sku is not null;

-- 3) List view with a computed stock status. security_invoker = true means the caller's RLS
--    on products applies (rule 5). New products with 0 stock read as 'out' until Step 6 adds stock.
create or replace view public.products_with_status
with (security_invoker = true) as
select
  p.*,
  case
    when p.quantity_on_hand <= 0 then 'out'
    when p.min_stock_level > 0 and p.quantity_on_hand <= p.min_stock_level then 'low'
    else 'ok'
  end as stock_status
from public.products p;

-- Explicit grants (rule 2): authenticated may read; nobody else gets anything.
revoke all on public.products_with_status from public, anon, authenticated;
grant select on public.products_with_status to authenticated;