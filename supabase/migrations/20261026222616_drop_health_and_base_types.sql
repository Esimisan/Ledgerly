-- Remove the Step 1 smoke-test table (its policy and grant are dropped with it)
drop table if exists public.app_health;

-- Enumerated types. Enums suit values that are fixed by the app's logic.
create type public.business_role      as enum ('owner', 'admin', 'manager', 'staff');
create type public.member_status      as enum ('active', 'suspended');
create type public.invitation_status  as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.document_kind      as enum ('sale', 'return', 'purchase_order');
create type public.stock_movement_type as enum
  ('opening_stock', 'purchase', 'sale', 'sale_return', 'damage', 'removal', 'adjustment');
create type public.payment_method     as enum
  ('cash', 'bank_transfer', 'card', 'pos', 'mobile_money', 'other');
create type public.refund_method      as enum ('cash', 'bank_transfer', 'store_credit', 'other');
create type public.return_condition   as enum ('resellable', 'damaged');
create type public.sale_status        as enum ('completed', 'voided');
create type public.discount_type      as enum ('percent', 'fixed');
create type public.po_status          as enum
  ('draft', 'ordered', 'partially_received', 'received', 'cancelled');
create type public.customer_txn_type  as enum
  ('credit_sale', 'payment', 'return_credit', 'adjustment');
create type public.subscription_status as enum
  ('trialing', 'active', 'past_due', 'cancelled', 'expired');
create type public.job_status         as enum ('queued', 'running', 'completed', 'failed');

-- Keeps updated_at accurate. Attached to tables in the last migration.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;