-- 1. Payment reference on the ledger
alter table public.customer_transactions add column reference text;
alter table public.customer_transactions
  add constraint customer_transactions_reference_length
  check (reference is null or char_length(reference) <= 100);

-- 2. New permission for manual balance adjustments (owner passes every check)
insert into public.role_permissions (business_id, role, permission)
select b.id, r.role, 'customers.adjust'
  from public.businesses b
 cross join (values ('admin'::public.business_role), ('manager'::public.business_role)) as r(role)
on conflict do nothing;

create or replace function public.seed_business_defaults(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Default expense categories (from the product plan)
  insert into public.expense_categories (business_id, name, is_system)
  select p_business_id, n, true
  from unnest(array[
    'Rent', 'Electricity', 'Internet', 'Salaries', 'Transportation',
    'Advertising', 'Equipment', 'Repairs', 'Other'
  ]) as n;

  -- Default role permissions (the owner needs no rows: it can do everything)
  insert into public.role_permissions (business_id, role, permission)
  select p_business_id, 'admin'::public.business_role, p
  from unnest(array[
    'products.write', 'inventory.adjust', 'suppliers.manage', 'customers.write',
    'customers.adjust', 'sales.create', 'sales.void', 'sales.return', 'discounts.manage',
    'purchases.manage', 'expenses.manage', 'finance.view', 'reports.view',
    'import.run', 'staff.manage', 'settings.manage', 'audit.view', 'backups.manage'
  ]) as p
  union all
  select p_business_id, 'manager'::public.business_role, p
  from unnest(array[
    'products.write', 'inventory.adjust', 'suppliers.manage', 'customers.write',
    'customers.adjust', 'sales.create', 'sales.void', 'sales.return', 'discounts.manage',
    'purchases.manage', 'expenses.manage', 'finance.view', 'reports.view',
    'import.run'
  ]) as p
  union all
  select p_business_id, 'staff'::public.business_role, p
  from unnest(array['sales.create', 'customers.write']) as p;

  -- Subscription row on the placeholder Free plan (real plans come in Step 14)
  insert into public.subscriptions (business_id, plan_id, status)
  select p_business_id, id, 'active'
  from public.subscription_plans
  where code = 'free';
end;
$fn$;

-- 3. What does ONE sale still owe? (balance-forward rule)
--    A customer's owed balance is assigned to their completed sales newest-first,
--    so payments clear the oldest sales first. Credit sale debt = balance_due minus
--    the debt cancelled by returns. Walk-in, voided and unknown sales owe 0.
create or replace function public.sale_outstanding(p_business_id uuid, p_sale_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $fn$
  select coalesce((
    select case
             when s.status <> 'completed' then 0::numeric
             else greatest(least(own.debt, c.balance - newer.debt), 0::numeric)
           end
      from public.sales s
      join public.customers c
        on c.business_id = s.business_id and c.id = s.customer_id
     cross join lateral (
       select greatest(
                s.balance_due - coalesce((select sum(r.debt_offset)
                                            from public.sale_returns r
                                           where r.business_id = s.business_id
                                             and r.sale_id = s.id), 0),
                0::numeric) as debt
     ) own
     cross join lateral (
       select coalesce(sum(greatest(
                s2.balance_due - coalesce((select sum(r2.debt_offset)
                                             from public.sale_returns r2
                                            where r2.business_id = s2.business_id
                                              and r2.sale_id = s2.id), 0),
                0::numeric)), 0::numeric) as debt
         from public.sales s2
        where s2.business_id = s.business_id
          and s2.customer_id = s.customer_id
          and s2.status = 'completed'
          and (s2.sold_at, s2.id) > (s.sold_at, s.id)
     ) newer
     where s.business_id = p_business_id and s.id = p_sale_id
  ), 0::numeric)
$fn$;

revoke all on function public.sale_outstanding(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sale_outstanding(uuid, uuid) to authenticated;

-- 4. Sales view: amount_outstanding now comes from sale_outstanding (same columns as before)
create or replace view public.sales_with_details
with (security_invoker = true) as
select
  s.id,
  s.business_id,
  s.sale_number,
  'S-' || lpad(s.sale_number::text, greatest(4, length(s.sale_number::text)), '0') as sale_label,
  s.customer_id,
  c.name as customer_name,
  s.discount_id,
  d.name as discount_name,
  d.code as discount_code,
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
  cp.full_name as created_by_name,
  s.voided_at,
  s.voided_by,
  vp.full_name as voided_by_name,
  s.void_reason,
  s.created_at,
  s.updated_at,
  coalesce(i.item_count, 0) as item_count,
  coalesce(i.units_total, 0::numeric) as units_total,
  coalesce(r.return_count, 0) as return_count,
  coalesce(r.refunded_total, 0::numeric) as refunded_total,
  public.sale_outstanding(s.business_id, s.id) as amount_outstanding
from public.sales s
  left join public.customers c on c.business_id = s.business_id and c.id = s.customer_id
  left join public.discounts d on d.business_id = s.business_id and d.id = s.discount_id
  left join public.profiles cp on cp.id = s.created_by
  left join public.profiles vp on vp.id = s.voided_by
  left join lateral (
    select count(*)::integer as item_count, sum(si.quantity) as units_total
      from public.sale_items si
     where si.business_id = s.business_id and si.sale_id = s.id
  ) i on true
  left join lateral (
    select count(*)::integer as return_count, sum(sr.refund_total) as refunded_total
      from public.sale_returns sr
     where sr.business_id = s.business_id and sr.sale_id = s.id
  ) r on true;

-- 5. Ledger view: same columns as before, plus reference at the end
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
  'R-' || lpad(sr.return_number::text, greatest(4, length(sr.return_number::text)), '0') as return_label,
  t.reference
from public.customer_transactions t
  left join public.profiles pr on pr.id = t.created_by
  left join public.sales s on s.business_id = t.business_id and s.id = t.sale_id
  left join public.sale_returns sr on sr.business_id = t.business_id and sr.id = t.sale_return_id;