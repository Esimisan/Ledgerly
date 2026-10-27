-- Pattern A: everyone in the business reads; a permission is needed to write

do $$
declare
  r text[];
  t text;
  perm text;
begin
  foreach r slice 1 in array array[
    ['categories', 'products.write'],
    ['products',   'products.write'],
    ['suppliers',  'suppliers.manage'],
    ['customers',  'customers.write'],
    ['discounts',  'discounts.manage']
  ]
  loop
    t := r[1];
    perm := r[2];
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (business_id in (select public.my_business_ids()))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.has_permission(business_id, %L))',
      t || '_insert', t, perm);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_permission(business_id, %L))
         with check (public.has_permission(business_id, %L))',
      t || '_update', t, perm, perm);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.has_permission(business_id, %L))',
      t || '_delete', t, perm);
  end loop;
end;
$$;

-- Pattern B: finance data. Reading needs finance.view, writing needs expenses.manage

do $$
declare
  t text;
begin
  foreach t in array array['expense_categories', 'expenses']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.has_permission(business_id, ''finance.view''))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.has_permission(business_id, ''expenses.manage''))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_permission(business_id, ''expenses.manage''))
         with check (public.has_permission(business_id, ''expenses.manage''))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.has_permission(business_id, ''expenses.manage''))',
      t || '_delete', t);
  end loop;
end;
$$;

-- Pattern C: read-only for every member (these tables are written only by RPC functions)

do $$
declare
  t text;
begin
  foreach t in array array[
    'stock_movements', 'customer_transactions',
    'sales', 'sale_items', 'sale_payments', 'sale_returns', 'sale_return_items',
    'subscriptions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (business_id in (select public.my_business_ids()))',
      t || '_select', t);
  end loop;
end;
$$;

-- Permission-gated, read-only tables

create policy purchase_orders_select on public.purchase_orders
  for select to authenticated
  using (public.has_permission(business_id, 'purchases.manage'));

create policy purchase_order_items_select on public.purchase_order_items
  for select to authenticated
  using (public.has_permission(business_id, 'purchases.manage'));

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.has_permission(business_id, 'audit.view'));

create policy backups_select on public.backups
  for select to authenticated
  using (public.has_permission(business_id, 'backups.manage'));

create policy import_jobs_select on public.import_jobs
  for select to authenticated
  using (public.has_permission(business_id, 'import.run'));

-- Global catalogue

create policy subscription_plans_select on public.subscription_plans
  for select to authenticated
  using (is_active);

-- profiles: see yourself and the people you share a business with; edit only yourself

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.business_members m
      where m.user_id = profiles.id
        and m.business_id in (select public.my_business_ids())
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- businesses

create policy businesses_select on public.businesses
  for select to authenticated
  using (id in (select public.my_business_ids()));

create policy businesses_update on public.businesses
  for update to authenticated
  using (public.has_permission(id, 'settings.manage'))
  with check (public.has_permission(id, 'settings.manage'));

-- business_members: the team list, with anti-escalation rules

create policy business_members_select on public.business_members
  for select to authenticated
  using (business_id in (select public.my_business_ids()));

-- Managers of staff cannot touch the owner, cannot edit themselves,
-- and can never hand out the owner role.
create policy business_members_update on public.business_members
  for update to authenticated
  using (
    public.has_permission(business_id, 'staff.manage')
    and role <> 'owner'
    and user_id <> (select auth.uid())
  )
  with check (role <> 'owner');

create policy business_members_remove on public.business_members
  for delete to authenticated
  using (
    public.has_permission(business_id, 'staff.manage')
    and role <> 'owner'
    and user_id <> (select auth.uid())
  );

-- Anyone except the owner may leave a business
create policy business_members_leave on public.business_members
  for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');

-- role_permissions: everyone can read their business's rules; ONLY the owner edits them

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (business_id in (select public.my_business_ids()));

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (
    public.has_role(business_id, array['owner']::public.business_role[])
    and role <> 'owner'
  );

create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using (
    public.has_role(business_id, array['owner']::public.business_role[])
    and role <> 'owner'
  )
  with check (
    public.has_role(business_id, array['owner']::public.business_role[])
    and role <> 'owner'
  );

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (public.has_role(business_id, array['owner']::public.business_role[]));

-- business_invitations: staff.manage only

create policy business_invitations_all on public.business_invitations
  for all to authenticated
  using (public.has_permission(business_id, 'staff.manage'))
  with check (public.has_permission(business_id, 'staff.manage'));

-- document_counters and billing_events intentionally have NO policies
-- and no grants: only our own database functions and the service role touch them.