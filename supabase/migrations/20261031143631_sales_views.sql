-- Step 8, migration 2 of 5: sales_views

-- 1) Sales list / detail view
create or replace view public.sales_with_details
with (security_invoker = true) as
select
  s.id,
  s.business_id,
  s.sale_number,
  'S-' || lpad(s.sale_number::text, greatest(4, length(s.sale_number::text)), '0') as sale_label,
  s.customer_id,
  c.name            as customer_name,
  s.discount_id,
  d.name            as discount_name,
  d.code            as discount_code,
  s.status,
  s.sold_at,
  s.subtotal,
  s.discount_total,
  s.tax_total,
  s.total,
  s.cost_total,
  s.amount_paid,
  s.balance_due,
  s.payment_method,
  s.notes,
  s.created_by,
  cp.full_name      as created_by_name,
  s.voided_at,
  s.voided_by,
  vp.full_name      as voided_by_name,
  s.void_reason,
  s.created_at,
  s.updated_at,
  coalesce(i.item_count, 0)          as item_count,
  coalesce(i.units_total, 0)         as units_total,
  coalesce(r.return_count, 0)        as return_count,
  coalesce(r.refunded_total, 0)      as refunded_total,
  case
    when s.status = 'completed'
      then greatest(s.balance_due - coalesce(r.debt_offset_total, 0), 0)
    else 0
  end                                as amount_outstanding
from public.sales s
left join public.customers c
       on c.business_id = s.business_id and c.id = s.customer_id
left join public.discounts d
       on d.business_id = s.business_id and d.id = s.discount_id
left join public.profiles cp on cp.id = s.created_by
left join public.profiles vp on vp.id = s.voided_by
left join lateral (
  select count(*)::integer as item_count, sum(si.quantity) as units_total
    from public.sale_items si
   where si.business_id = s.business_id and si.sale_id = s.id
) i on true
left join lateral (
  select count(*)::integer as return_count,
         sum(sr.refund_total) as refunded_total,
         sum(sr.debt_offset)  as debt_offset_total
    from public.sale_returns sr
   where sr.business_id = s.business_id and sr.sale_id = s.id
) r on true;

revoke all on public.sales_with_details from public, anon, authenticated;
grant select on public.sales_with_details to authenticated;

-- 2) Returns with labels and names
create or replace view public.sale_returns_with_details
with (security_invoker = true) as
select
  r.id,
  r.business_id,
  r.return_number,
  'R-' || lpad(r.return_number::text, greatest(4, length(r.return_number::text)), '0') as return_label,
  r.sale_id,
  s.sale_number,
  'S-' || lpad(s.sale_number::text, greatest(4, length(s.sale_number::text)), '0') as sale_label,
  r.customer_id,
  c.name              as customer_name,
  r.returned_at,
  r.refund_total,
  r.debt_offset,
  r.refund_total - r.debt_offset as refund_paid,
  r.refund_method,
  r.reason,
  r.created_by,
  p.full_name         as created_by_name,
  r.created_at
from public.sale_returns r
join public.sales s
  on s.business_id = r.business_id and s.id = r.sale_id
left join public.customers c
  on c.business_id = r.business_id and c.id = r.customer_id
left join public.profiles p on p.id = r.created_by;

revoke all on public.sale_returns_with_details from public, anon, authenticated;
grant select on public.sale_returns_with_details to authenticated;

-- 3) Extend the customer ledger view. The original 13 columns keep their
--    order; the new columns are appended at the end (required by CREATE OR REPLACE).
create or replace view public.customer_transactions_with_details
with (security_invoker = true) as
select
  t.id,
  t.business_id,
  t.customer_id,
  t.txn_type,
  t.amount,
  t.balance_after,
  t.sale_id,
  t.sale_return_id,
  t.payment_method,
  t.note,
  t.created_by,
  pr.full_name as created_by_name,
  t.created_at,
  s.sale_number,
  'S-' || lpad(s.sale_number::text, greatest(4, length(s.sale_number::text)), '0') as sale_label,
  s.status as sale_status,
  sr.return_number,
  'R-' || lpad(sr.return_number::text, greatest(4, length(sr.return_number::text)), '0') as return_label
from public.customer_transactions t
left join public.profiles pr on pr.id = t.created_by
left join public.sales s
       on s.business_id = t.business_id and s.id = t.sale_id
left join public.sale_returns sr
       on sr.business_id = t.business_id and sr.id = t.sale_return_id;

revoke all on public.customer_transactions_with_details from public, anon, authenticated;
grant select on public.customer_transactions_with_details to authenticated;