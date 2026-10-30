-- Customers become deactivate-only, phone/email are unique per business,
-- blank values are rejected, and only discounts.manage can set a discount level.

-- Deactivate-only (rule 10) 
-- The table-level DELETE grant and its policy both go, as we did for suppliers.
drop policy if exists customers_delete on public.customers;
revoke delete on public.customers from authenticated;
revoke all on public.customers from anon;

-- Uniqueness that survives formatting differences ----------------------------
-- The old index treats "0803 123 4567" and "08031234567" as different numbers.
drop index if exists public.customers_business_phone_key;

create unique index customers_business_phone_norm_key
  on public.customers (business_id, regexp_replace(phone, '[^0-9+]', '', 'g'))
  where phone is not null;

create unique index customers_business_email_key
  on public.customers (business_id, lower(btrim(email)))
  where email is not null;

--Reject blank / junk values -------------------------------------------------
-- The form sends NULL for empty fields; the database also refuses "" so a
-- second client can never collide on an empty string.
alter table public.customers
  add constraint customers_phone_valid
    check (phone is null or regexp_replace(phone, '[^0-9]', '', 'g') <> ''),
  add constraint customers_email_valid
    check (email is null or (btrim(email) <> '' and position('@' in email) > 1)),
  add constraint customers_text_lengths
    check (
      char_length(name) <= 120
      and char_length(coalesce(phone, ''))   <= 40
      and char_length(coalesce(email, ''))   <= 160
      and char_length(coalesce(address, '')) <= 240
      and char_length(coalesce(notes, ''))   <= 1000
    );

-- Discount level needs discounts.manage ----------------------------------------
-- Staff have customers.write, and the column grants let them write
create or replace function public.guard_customer_discount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Clients always carry a user id, and anon has no access to this table.
  if auth.uid() is null then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.discount_percent <> 0)
     or (tg_op = 'UPDATE' and new.discount_percent is distinct from old.discount_percent)
  then
    if not public.has_permission(new.business_id, 'discounts.manage') then
      raise exception 'Only a manager, admin or the owner can set a customer''s discount level.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_customer_discount() from public, anon, authenticated;

create trigger customers_guard_discount
  before insert or update on public.customers
  for each row execute function public.guard_customer_discount();

--Ledger view with the recorder's name 
-- comes from profiles (same approach as stock_movements_with_details).
create view public.customer_transactions_with_details
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
  t.created_at
from public.customer_transactions t
left join public.profiles pr on pr.id = t.created_by;

revoke all on public.customer_transactions_with_details from public, anon, authenticated;
grant select on public.customer_transactions_with_details to authenticated;