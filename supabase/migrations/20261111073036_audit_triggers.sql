create or replace function public.audit_name(p_uid uuid)
returns text language sql stable security definer set search_path = ''
as $fn$
  select coalesce(
    (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = p_uid),
    'a team member');
$fn$;

create or replace function public.audit_money(p_business uuid, p_amount numeric)
returns text language sql stable security definer set search_path = ''
as $fn$
  select case when p_amount < 0 then '-' else '' end
      || coalesce((select b.currency_symbol from public.businesses b where b.id = p_business), '')
      || to_char(abs(coalesce(p_amount, 0)), 'FM999,999,999,990.00');
$fn$;

-- {"field": {"old": .., "new": ..}} for the listed keys that differ; null when none differ
create or replace function public.audit_diff(p_old jsonb, p_new jsonb, p_keys text[])
returns jsonb language sql immutable set search_path = ''
as $fn$
  select nullif(
    coalesce(
      jsonb_object_agg(k, jsonb_build_object('old', p_old -> k, 'new', p_new -> k))
        filter (where (p_old -> k) is distinct from (p_new -> k)),
      '{}'::jsonb),
    '{}'::jsonb)
  from unnest(p_keys) as k;
$fn$;

-- Turns one row change into (action, readable summary, changed fields).
-- o_action null means "nothing worth logging". Never reads or returns a token.
create or replace function public.audit_describe(
  p_table text, p_op text, p_old jsonb, p_new jsonb,
  out o_action text, out o_summary text, out o_changes jsonb)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_row jsonb := coalesce(p_new, p_old);
  v_biz uuid := case when p_table = 'businesses'
                     then (v_row ->> 'id')::uuid
                     else (v_row ->> 'business_id')::uuid end;
  v_name text;
  v_n text;
  v_labels text;
  v_qty numeric;
begin
  if p_table = 'business_members' then
    v_name := public.audit_name((v_row ->> 'user_id')::uuid);
    if p_op = 'INSERT' then
      o_action := 'member_added';
      o_summary := v_name || ' joined the team as ' || initcap(p_new ->> 'role');
      o_changes := jsonb_build_object('role', p_new ->> 'role');
    elsif p_op = 'UPDATE' then
      if p_new ->> 'role' is distinct from p_old ->> 'role' then
        o_action := 'role_changed';
        o_summary := format('Changed the role of %s from %s to %s',
          v_name, initcap(p_old ->> 'role'), initcap(p_new ->> 'role'));
        o_changes := public.audit_diff(p_old, p_new, array['role', 'status']);
      elsif p_new ->> 'status' is distinct from p_old ->> 'status' then
        o_action := case when p_new ->> 'status' = 'suspended' then 'suspended' else 'reactivated' end;
        o_summary := case when o_action = 'suspended' then 'Suspended ' else 'Reactivated ' end || v_name;
        o_changes := public.audit_diff(p_old, p_new, array['status']);
      end if;
    end if;

  elsif p_table = 'invitations' then
    if p_op = 'INSERT' then
      o_action := 'invitation_created';
      o_summary := format('Invited %s as %s', p_new ->> 'email', initcap(p_new ->> 'role'));
      o_changes := jsonb_build_object('role', p_new ->> 'role');
    elsif p_op = 'UPDATE' and p_new ->> 'status' is distinct from p_old ->> 'status' then
      if p_new ->> 'status' = 'revoked' then
        o_action := 'invitation_revoked';
        o_summary := format('Cancelled the invitation for %s', p_new ->> 'email');
        o_changes := public.audit_diff(p_old, p_new, array['status']);
      elsif p_new ->> 'status' = 'accepted' then
        o_action := 'invitation_accepted';
        o_summary := format('%s accepted the invitation and joined as %s',
          p_new ->> 'email', initcap(p_new ->> 'role'));
        o_changes := public.audit_diff(p_old, p_new, array['status']);
      end if;
    end if;

  elsif p_table = 'businesses' then
    if p_op = 'UPDATE' then
      o_changes := public.audit_diff(p_old, p_new, array[
        'name', 'phone', 'email', 'address', 'logo_path', 'currency_code',
        'currency_symbol', 'timezone', 'default_tax_rate', 'receipt_footer',
        'low_stock_default', 'is_active']);
      if o_changes is not null then
        select string_agg(case k.key
                 when 'logo_path' then 'logo'
                 when 'currency_code' then 'currency'
                 when 'currency_symbol' then 'currency symbol'
                 when 'default_tax_rate' then 'tax rate'
                 when 'receipt_footer' then 'receipt footer'
                 when 'low_stock_default' then 'low-stock default'
                 when 'is_active' then 'active status'
                 else k.key end, ', ' order by k.key)
          into v_labels
          from jsonb_object_keys(o_changes) as k(key);
        o_action := 'settings_changed';
        o_summary := 'Updated business settings: ' || v_labels;
      end if;
    end if;

  elsif p_table = 'sales' then
    if p_op = 'UPDATE'
       and p_old ->> 'voided_at' is null and p_new ->> 'voided_at' is not null then
      o_action := 'sale_voided';
      o_summary := format('Voided sale #%s (%s)%s',
        p_new ->> 'sale_number',
        public.audit_money(v_biz, (p_new ->> 'total')::numeric),
        coalesce(': ' || nullif(btrim(p_new ->> 'void_reason'), ''), ''));
      o_changes := jsonb_build_object('total', p_new -> 'total', 'void_reason', p_new -> 'void_reason');
    end if;

  elsif p_table = 'sale_returns' then
    if p_op = 'INSERT' then
      select s.sale_number::text into v_n
        from public.sales s where s.id = (p_new ->> 'sale_id')::uuid;
      o_action := 'sale_return';
      o_summary := format('Recorded return #%s for sale #%s',
        p_new ->> 'return_number', coalesce(v_n, '?'));
      o_changes := jsonb_build_object('reason', p_new -> 'reason');
    end if;

  elsif p_table = 'products' then
    v_name := coalesce(v_row ->> 'name', 'a product');
    if p_op = 'DELETE' then
      o_action := 'product_deleted';
      o_summary := 'Deleted product ' || v_name;
    elsif p_op = 'UPDATE' then
      if p_old ->> 'deleted_at' is null and p_new ->> 'deleted_at' is not null then
        o_action := 'product_deleted';
        o_summary := format('Removed product %s from the catalogue (its history is kept)', v_name);
      elsif p_old -> 'cost_price' is distinct from p_new -> 'cost_price'
         or p_old -> 'selling_price' is distinct from p_new -> 'selling_price' then
        o_action := 'price_changed';
        o_changes := public.audit_diff(p_old, p_new, array['cost_price', 'selling_price']);
        v_labels := array_to_string(array_remove(array[
          case when p_old -> 'selling_price' is distinct from p_new -> 'selling_price'
               then format('selling price %s to %s',
                      public.audit_money(v_biz, (p_old ->> 'selling_price')::numeric),
                      public.audit_money(v_biz, (p_new ->> 'selling_price')::numeric)) end,
          case when p_old -> 'cost_price' is distinct from p_new -> 'cost_price'
               then format('cost price %s to %s',
                      public.audit_money(v_biz, (p_old ->> 'cost_price')::numeric),
                      public.audit_money(v_biz, (p_new ->> 'cost_price')::numeric)) end
        ], null), ', ');
        o_summary := format('Changed prices of %s: %s', v_name, v_labels);
      elsif p_old -> 'is_active' is distinct from p_new -> 'is_active' then
        o_action := case when (p_new ->> 'is_active')::boolean
                         then 'product_reactivated' else 'product_deactivated' end;
        o_summary := case when o_action = 'product_reactivated' then 'Reactivated product ' else 'Deactivated product ' end || v_name;
        o_changes := public.audit_diff(p_old, p_new, array['is_active']);
      end if;
    end if;

  elsif p_table = 'customers' then
    v_name := coalesce(v_row ->> 'name', 'a customer');
    if p_op = 'UPDATE' then
      if p_old -> 'discount_percent' is distinct from p_new -> 'discount_percent' then
        o_action := 'discount_level_changed';
        o_summary := format('Changed the discount level of %s from %s%% to %s%%', v_name,
          trim_scale((p_old ->> 'discount_percent')::numeric),
          trim_scale((p_new ->> 'discount_percent')::numeric));
        o_changes := public.audit_diff(p_old, p_new, array['discount_percent']);
      elsif p_old -> 'is_active' is distinct from p_new -> 'is_active' then
        o_action := case when (p_new ->> 'is_active')::boolean
                         then 'customer_reactivated' else 'customer_deactivated' end;
        o_summary := case when o_action = 'customer_reactivated' then 'Reactivated customer ' else 'Deactivated customer ' end || v_name;
        o_changes := public.audit_diff(p_old, p_new, array['is_active']);
      end if;
    end if;

  elsif p_table = 'expenses' then
    v_n := coalesce(nullif(btrim(v_row ->> 'description'), ''),
                    nullif(btrim(v_row ->> 'vendor'), ''), 'no description');
    if p_op = 'DELETE' then
      o_action := 'expense_deleted';
      o_summary := format('Deleted an expense of %s (%s)',
        public.audit_money(v_biz, (p_old ->> 'amount')::numeric), v_n);
    elsif p_op = 'UPDATE' then
      if p_old ->> 'voided_at' is null and p_new ->> 'voided_at' is not null then
        o_action := 'expense_voided';
        o_summary := format('Voided an expense of %s (%s)%s',
          public.audit_money(v_biz, (p_new ->> 'amount')::numeric), v_n,
          coalesce(': ' || nullif(btrim(p_new ->> 'void_reason'), ''), ''));
        o_changes := jsonb_build_object('amount', p_new -> 'amount', 'void_reason', p_new -> 'void_reason');
      else
        o_changes := public.audit_diff(p_old, p_new, array['amount', 'expense_date', 'category_id']);
        if o_changes is not null then
          select string_agg(case k.key
                   when 'expense_date' then 'date'
                   when 'category_id' then 'category'
                   else k.key end, ', ' order by k.key)
            into v_labels
            from jsonb_object_keys(o_changes) as k(key);
          o_action := 'expense_edited';
          o_summary := format('Edited an expense (%s): %s', v_n, v_labels);
        end if;
      end if;
    end if;

  elsif p_table = 'stock_movements' then
    if p_op = 'INSERT' then
      select p.name into v_name from public.products p where p.id = (p_new ->> 'product_id')::uuid;
      v_qty := (p_new ->> 'quantity_change')::numeric;
      o_action := 'stock_adjusted';
      o_summary := format('Recorded %s for %s: %s%s',
        case p_new ->> 'movement_type'
          when 'adjustment' then 'a stock adjustment'
          when 'damage' then 'damaged goods'
          when 'removal' then 'a stock removal'
          else p_new ->> 'movement_type' end,
        coalesce(v_name, 'a product'),
        case when v_qty > 0 then '+' else '' end || trim_scale(v_qty)::text,
        coalesce(' (' || nullif(btrim(p_new ->> 'note'), '') || ')', ''));
      o_changes := jsonb_build_object(
        'movement_type', p_new ->> 'movement_type',
        'quantity_change', p_new -> 'quantity_change',
        'balance_after', p_new -> 'balance_after');
    end if;

  elsif p_table = 'customer_transactions' then
    if p_op = 'INSERT' then
      select c.name into v_name from public.customers c where c.id = (p_new ->> 'customer_id')::uuid;
      o_action := 'balance_adjusted';
      o_summary := format('Adjusted the balance of %s by %s (balance now %s)%s',
        coalesce(v_name, 'a customer'),
        public.audit_money(v_biz, (p_new ->> 'amount')::numeric),
        public.audit_money(v_biz, (p_new ->> 'balance_after')::numeric),
        coalesce(': ' || nullif(btrim(p_new ->> 'note'), ''), ''));
      o_changes := jsonb_build_object('amount', p_new -> 'amount', 'balance_after', p_new -> 'balance_after');
    end if;

  else
    -- Any table attached later with no special case above
    o_action := case p_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
    o_summary := format('%s a record in %s', initcap(o_action), replace(p_table, '_', ' '));
    if p_op = 'UPDATE' then
      select jsonb_object_agg(k.key, jsonb_build_object('old', p_old -> k.key, 'new', p_new -> k.key))
        into o_changes
        from jsonb_object_keys(p_new) as k(key)
       where k.key not in ('updated_at', 'token', 'secret', 'password')
         and (p_old -> k.key) is distinct from (p_new -> k.key);
      if o_changes is null then o_action := null; end if;
    end if;
  end if;
end
$fn$;

-- The trigger function every audited table uses. Argument 0 is the area.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_bid uuid;
  v_rid uuid;
  d record;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  v_bid := case when tg_table_name = 'businesses'
                then (v_row ->> 'id')::uuid
                else (v_row ->> 'business_id')::uuid end;
  if v_bid is null then return null; end if;

  -- The transaction that creates a business is not logged (owner membership, defaults)
  if exists (select 1 from public.businesses b where b.id = v_bid and b.created_at = now()) then
    return null;
  end if;

  select * into d from public.audit_describe(tg_table_name, tg_op, v_old, v_new);
  if d.o_action is null then return null; end if;

  v_rid := case when v_row ->> 'id' ~* '^[0-9a-f-]{36}$' then (v_row ->> 'id')::uuid end;
  perform public.audit_write(v_bid, tg_argv[0], tg_table_name, v_rid,
                             d.o_action, d.o_summary, d.o_changes);
  return null;
end
$fn$;

-- One line per table. p_events and p_when are written by migrations only.
create or replace function public.audit_attach(
  p_table regclass, p_area text,
  p_events text default 'insert or update or delete',
  p_when text default null)
returns void language plpgsql set search_path = ''
as $fn$
begin
  execute format('drop trigger if exists zz_audit on %s', p_table);
  execute format(
    'create trigger zz_audit after %s on %s for each row %sexecute function public.audit_row(%L)',
    p_events, p_table,
    case when p_when is null then '' else 'when (' || p_when || ') ' end,
    p_area);
end
$fn$;

-- Permission changes are logged here: the function deletes and re-inserts all rows
-- of a role, so a row trigger would log dozens of rows per save.
create or replace function public.set_role_permissions(
  p_business_id uuid, p_role public.business_role, p_permissions text[])
returns void language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_my public.business_role;
  v_clean text[];
  v_bad text;
  v_before text[];
  v_added text[];
  v_removed text[];
begin
  if v_uid is null or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'You do not have permission to manage staff.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'manager', 'staff') then
    raise exception 'The owner always has every permission and cannot be edited.'
      using errcode = '22023';
  end if;
  select m.role into v_my from public.business_members m
   where m.business_id = p_business_id and m.user_id = v_uid;
  if v_my <> 'owner' and p_role not in ('manager', 'staff') then
    raise exception 'Only the owner can change what admins can do.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x order by x), array[]::text[]) into v_clean
    from unnest(coalesce(p_permissions, array[]::text[])) x;
  select x into v_bad from unnest(v_clean) x
   where x <> all (public.all_permissions()) limit 1;
  if v_bad is not null then
    raise exception 'Unknown permission: %', v_bad using errcode = '22023';
  end if;
  if p_role = 'admin' and not (v_clean @> array['staff.manage', 'settings.manage']) then
    raise exception 'Admins always keep Manage staff and Manage settings.' using errcode = '22023';
  end if;

  select coalesce(array_agg(rp.permission order by rp.permission), array[]::text[])
    into v_before
    from public.role_permissions rp
   where rp.business_id = p_business_id and rp.role = p_role;

  delete from public.role_permissions where business_id = p_business_id and role = p_role;
  insert into public.role_permissions (business_id, role, permission)
  select p_business_id, p_role, x from unnest(v_clean) x;

  v_added := array(select x from unnest(v_clean) x where x <> all (v_before) order by x);
  v_removed := array(select x from unnest(v_before) x where x <> all (v_clean) order by x);
  if cardinality(v_added) > 0 or cardinality(v_removed) > 0 then
    perform public.audit_write(
      p_business_id, 'Permissions', 'role_permissions', null, 'permissions_changed',
      format('Changed what %s can do (%s allowed, %s removed)',
             initcap(p_role::text), cardinality(v_added), cardinality(v_removed)),
      jsonb_build_object('role', p_role, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
  end if;
end
$fn$;

-- Attach the sensitive tables
do $do$
declare
  v_labels text;
begin
  perform public.audit_attach('public.business_members', 'Staff', 'insert or update');
  perform public.audit_attach('public.invitations', 'Staff', 'insert or update');
  perform public.audit_attach('public.businesses', 'Settings',
    'update of name, phone, email, address, logo_path, currency_code, currency_symbol, timezone, default_tax_rate, receipt_footer, low_stock_default, is_active');
  perform public.audit_attach('public.sales', 'Sales', 'update of voided_at');
  perform public.audit_attach('public.sale_returns', 'Sales', 'insert');
  perform public.audit_attach('public.products', 'Products',
    'update of cost_price, selling_price, is_active, deleted_at or delete');
  perform public.audit_attach('public.expenses', 'Expenses',
    'update of voided_at, amount, expense_date, category_id or delete');
  perform public.audit_attach('public.customers', 'Customers',
    'update of discount_percent, is_active');
  perform public.audit_attach('public.stock_movements', 'Stock', 'insert',
    $w$new.movement_type::text in ('adjustment', 'damage', 'removal')$w$);

  select string_agg(quote_literal(e.enumlabel), ', ') into v_labels
    from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'customer_txn_type' and e.enumlabel ilike '%adjust%';
  if v_labels is null then
    raise exception 'customer_txn_type has no adjustment value. Send me its labels and I will adjust this block.';
  end if;
  perform public.audit_attach('public.customer_transactions', 'Customers', 'insert',
    'new.txn_type::text in (' || v_labels || ')');
end
$do$;

-- Grants: all of these are internal. set_role_permissions keeps its existing grants.
revoke all on function public.audit_name(uuid) from public, anon, authenticated;
revoke all on function public.audit_money(uuid, numeric) from public, anon, authenticated;
revoke all on function public.audit_diff(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.audit_describe(text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.audit_attach(regclass, text, text, text) from public, anon, authenticated;