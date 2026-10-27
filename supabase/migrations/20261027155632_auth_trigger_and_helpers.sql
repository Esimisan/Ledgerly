-- ============ Signup: create a profile for every new auth user ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: any user that already exists (e.g. a test signup) gets a profile too
insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

-- ============ Helper functions (security definer: they bypass RLS on purpose) ============
create or replace function public.my_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select business_id
  from public.business_members
  where user_id = (select auth.uid())
    and status = 'active';
$$;

create or replace function public.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = p_business_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function public.has_role(p_business_id uuid, p_roles public.business_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = p_business_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role = any (p_roles)
  );
$$;

create or replace function public.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'owner'
        or exists (
          select 1
          from public.role_permissions rp
          where rp.business_id = m.business_id
            and rp.role = m.role
            and rp.permission = p_permission
        )
      )
  );
$$;

-- Signed-in users may call these (policies need it); anonymous users may not.
revoke all on function public.my_business_ids()                          from public, anon;
revoke all on function public.is_member(uuid)                            from public, anon;
revoke all on function public.has_role(uuid, public.business_role[])     from public, anon;
revoke all on function public.has_permission(uuid, text)                 from public, anon;
grant execute on function public.my_business_ids()                       to authenticated;
grant execute on function public.is_member(uuid)                         to authenticated;
grant execute on function public.has_role(uuid, public.business_role[])  to authenticated;
grant execute on function public.has_permission(uuid, text)              to authenticated;

-- ============ business_id can never be changed once a row exists ============
create or replace function public.prevent_business_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'business_id cannot be changed';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'business_members', 'role_permissions', 'business_invitations', 'subscriptions',
    'categories', 'suppliers', 'products', 'stock_movements',
    'customers', 'discounts', 'customer_transactions',
    'sales', 'sale_items', 'sale_payments', 'sale_returns', 'sale_return_items',
    'purchase_orders', 'purchase_order_items', 'expense_categories', 'expenses',
    'audit_log', 'backups', 'import_jobs'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.prevent_business_id_change()',
      t || '_lock_business_id', t);
  end loop;
end;
$$;