-- Expenses with the category name and the names of who added/voided them.
-- security_invoker: the caller's own RLS (finance.view) applies.
create view public.expenses_with_details
with (security_invoker = true) as
select
  e.id,
  e.business_id,
  e.category_id,
  c.name       as category_name,
  c.is_active  as category_is_active,
  e.amount,
  e.expense_date,
  e.description,
  e.vendor,
  e.payment_method,
  e.receipt_path,
  e.created_by,
  cp.full_name as created_by_name,
  e.created_at,
  e.updated_at,
  e.voided_at,
  e.voided_by,
  vp.full_name as voided_by_name,
  e.void_reason,
  (e.voided_at is not null) as is_voided
from public.expenses e
join public.expense_categories c
  on c.business_id = e.business_id and c.id = e.category_id
left join public.profiles cp on cp.id = e.created_by
left join public.profiles vp on vp.id = e.voided_by;

revoke all on public.expenses_with_details from public, anon, authenticated;
grant select on public.expenses_with_details to authenticated;