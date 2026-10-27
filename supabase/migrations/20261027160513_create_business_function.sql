-- ============ Defaults every new business starts with (internal only) ============
create or replace function public.seed_business_defaults(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    'sales.create', 'sales.void', 'sales.return', 'discounts.manage',
    'purchases.manage', 'expenses.manage', 'finance.view', 'reports.view',
    'import.run', 'staff.manage', 'settings.manage', 'audit.view', 'backups.manage'
  ]) as p
  union all
  select p_business_id, 'manager'::public.business_role, p
  from unnest(array[
    'products.write', 'inventory.adjust', 'suppliers.manage', 'customers.write',
    'sales.create', 'sales.void', 'sales.return', 'discounts.manage',
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
$$;
revoke all on function public.seed_business_defaults(uuid) from public, anon, authenticated;

-- ============ create_business: the one atomic entry point ============
create or replace function public.create_business(
  p_name            text,
  p_phone           text default null,
  p_currency_code   text default 'NGN',
  p_currency_symbol text default '₦',
  p_timezone        text default 'Africa/Lagos'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Business name is required' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone: %', p_timezone using errcode = '22023';
  end if;

  insert into public.businesses
    (name, owner_id, phone, currency_code, currency_symbol, timezone)
  values
    (trim(p_name), v_uid, nullif(trim(p_phone), ''),
     upper(p_currency_code), p_currency_symbol, p_timezone)
  returning id into v_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_id, v_uid, 'owner');

  perform public.seed_business_defaults(v_id);

  return v_id;
end;
$$;
revoke all on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;