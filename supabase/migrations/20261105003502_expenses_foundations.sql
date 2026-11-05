
-- 1. Expense categories: deactivate-only

alter table public.expense_categories
  add column is_active  boolean     not null default true,
  add column updated_at timestamptz not null default now(),
  add constraint expense_categories_name_length
    check (char_length(btrim(name)) <= 60);

create trigger expense_categories_set_updated_at
  before update on public.expense_categories
  for each row execute function public.set_updated_at();

-- No deleting categories (not even for the owner).
drop policy expense_categories_delete on public.expense_categories;
revoke delete on public.expense_categories from authenticated;

-- Clients may only set the name when creating, and only the name and
-- active flag when changing. is_system and business_id stay server-side.
revoke insert, update on public.expense_categories from authenticated;
grant insert (business_id, name) on public.expense_categories to authenticated;
grant update (name, is_active)   on public.expense_categories to authenticated;


-- 2. Expenses: void-only

alter table public.expenses
  add column voided_at   timestamptz,
  add column voided_by   uuid references auth.users (id) on delete set null,
  add column void_reason text,
  add constraint expenses_void_consistency check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null)
  ),
  add constraint expenses_void_reason_length
    check (void_reason is null or char_length(void_reason) <= 500),
  add constraint expenses_description_length
    check (description is null or char_length(description) <= 500),
  add constraint expenses_vendor_length
    check (vendor is null or char_length(vendor) <= 120),
  add constraint expenses_receipt_path_owner
    check (receipt_path is null
           or starts_with(receipt_path, business_id::text || '/'));

-- No deleting expenses (not even for the owner): they are voided instead.
drop policy expenses_delete on public.expenses;
revoke delete on public.expenses from authenticated;

-- Clients write only the editable columns. created_by fills itself from
-- auth.uid(); the void columns are written only by void_expense().
revoke insert, update on public.expenses from authenticated;
grant insert (business_id, category_id, amount, expense_date, description,
              vendor, payment_method, receipt_path)
  on public.expenses to authenticated;
grant update (category_id, amount, expense_date, description, vendor,
              payment_method, receipt_path)
  on public.expenses to authenticated;


-- 3. Guard triggers

-- A voided expense is frozen.
create function public.guard_voided_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.voided_at is not null then
    raise exception 'This expense has been voided and can no longer be changed';
  end if;
  return new;
end;
$$;

-- New expenses (or a changed category) need an active category.
-- SECURITY DEFINER so the check works even if the caller cannot read categories.
create function public.check_expense_category_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.category_id = old.category_id then
    return new;
  end if;
  if not exists (
    select 1
      from public.expense_categories c
     where c.business_id = new.business_id
       and c.id = new.category_id
       and c.is_active
  ) then
    raise exception 'Choose an active category for this expense';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_voided_expense()          from public, anon, authenticated;
revoke all on function public.check_expense_category_active() from public, anon, authenticated;

-- Triggers fire alphabetically: guard_voided, lock_business_id, set_updated_at.
create trigger expenses_guard_voided
  before update on public.expenses
  for each row execute function public.guard_voided_expense();

create trigger expenses_check_category_active
  before insert or update of category_id on public.expenses
  for each row execute function public.check_expense_category_active();