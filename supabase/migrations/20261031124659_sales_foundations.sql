-- Step 8, migration 1 of 5: sales_foundations

-- 1) Discounts are deactivate-only. Remove the delete policy first, then the grant.
drop policy if exists discounts_delete on public.discounts;
revoke delete on public.discounts from authenticated;
revoke delete on public.discounts from anon;

-- 2) A return line records whether the goods went back on the shelf.
--    Existing rows (none yet) default to false.
alter table public.sale_return_items
  add column restocked boolean not null default false;

-- 3) A return records how much of its refund only cancelled debt still owed on
--    the sale (no money moves). The rest (refund_total - debt_offset) is paid out
--    using refund_method.
alter table public.sale_returns
  add column debt_offset numeric(14,2) not null default 0,
  add constraint sale_returns_debt_offset_within_refund
    check (debt_offset >= 0 and debt_offset <= refund_total);

-- 4) Indexes for lookups the next migrations and the sale detail page will do.
create index if not exists customer_transactions_sale_idx
  on public.customer_transactions (business_id, sale_id)
  where sale_id is not null;

create index if not exists customer_transactions_return_idx
  on public.customer_transactions (business_id, sale_return_id)
  where sale_return_id is not null;

create index if not exists sale_return_items_sale_item_idx
  on public.sale_return_items (business_id, sale_item_id);