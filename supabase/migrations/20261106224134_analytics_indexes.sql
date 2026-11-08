-- Period revenue / orders / series: completed sales by date, answered from the index alone.
create index if not exists sales_completed_sold_at_idx
  on public.sales (business_id, sold_at)
  include (total, cost_total, customer_id)
  where status = 'completed';

-- Customer analytics: first purchase, returning buyers, per-customer totals.
create index if not exists sales_completed_customer_idx
  on public.sales (business_id, customer_id, sold_at)
  where status = 'completed' and customer_id is not null;

-- Refunds are counted by returned_at, which had no date index.
create index if not exists sale_returns_returned_at_idx
  on public.sale_returns (business_id, returned_at)
  include (refund_total, customer_id);

-- Product aggregation joins sales -> items by sale_id and reads these columns.
create index if not exists sale_items_sale_cover_idx
  on public.sale_items (sale_id)
  include (product_id, quantity, unit_cost);

-- Operating expenses: non-voided only, summed straight from the index.
create index if not exists expenses_active_date_idx
  on public.expenses (business_id, expense_date)
  include (amount)
  where voided_at is null;

-- "New customers this month".
create index if not exists customers_created_idx
  on public.customers (business_id, created_at);

-- Stock flags only look at live products.
create index if not exists products_active_idx
  on public.products (business_id)
  where is_active and deleted_at is null;