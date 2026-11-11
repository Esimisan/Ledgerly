alter table public.backups add column if not exists row_counts jsonb;

-- The function marks a backup done using the enum's "completed" label. Fail now if it has none.
do $do$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'job_status'
       and (e.enumlabel ilike 'complet%' or e.enumlabel in ('done', 'succeeded', 'success'))) then
    raise exception 'job_status has no completed-style value. Send me its labels and I will adjust this block.';
  end if;
end
$do$;

create or replace function public.create_backup(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  -- Left out on purpose: invitations and business_invitations (tokens), billing_events and
  -- subscriptions (unused), import_jobs, backups, and audit_log (append-only, stays in the database).
  v_tables constant text[] := array[
    'business_members', 'role_permissions', 'categories', 'suppliers', 'customers',
    'customer_transactions', 'discounts', 'document_counters', 'expense_categories',
    'expenses', 'products', 'stock_movements', 'purchase_orders', 'purchase_order_items',
    'purchase_receipts', 'purchase_receipt_items', 'sales', 'sale_items', 'sale_payments',
    'sale_returns', 'sale_return_items'];
  v_t text;
  v_part jsonb;
  v_snap jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
  v_total bigint := 0;
  v_done text;
  v_out jsonb;
  v_size bigint;
  v_id uuid;
begin
  if auth.uid() is null or not public.has_permission(p_business_id, 'backups.manage') then
    raise exception 'You do not have permission to create backups.' using errcode = '42501';
  end if;

  select e.enumlabel::text into v_done
    from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'job_status'
     and (e.enumlabel ilike 'complet%' or e.enumlabel in ('done', 'succeeded', 'success'))
   order by (e.enumlabel ilike 'complet%') desc, e.enumsortorder
   limit 1;

  foreach v_t in array v_tables loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.business_id = $1',
      v_t)
      into v_part using p_business_id;
    v_n := jsonb_array_length(v_part);
    v_snap := v_snap || jsonb_build_object(v_t, v_part);
    v_counts := v_counts || jsonb_build_object(v_t, v_n);
    v_total := v_total + v_n;
  end loop;

  -- names and phones of the people in this business, so ids in the data stay readable
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone', p.phone)), '[]'::jsonb)
    into v_part
    from public.profiles p
   where p.id in (select m.user_id from public.business_members m where m.business_id = p_business_id);
  v_n := jsonb_array_length(v_part);
  v_snap := v_snap || jsonb_build_object('profiles', v_part);
  v_counts := v_counts || jsonb_build_object('profiles', v_n);
  v_total := v_total + v_n;

  v_out := jsonb_build_object(
    'format', 'ledgerly-backup',
    'version', 1,
    'created_at', now(),
    'business', (select to_jsonb(b) from public.businesses b where b.id = p_business_id),
    'row_counts', v_counts,
    'tables', v_snap);

  v_size := octet_length(v_out::text);
  if v_size > 50000000 then
    raise exception 'This business is too large for an in-app backup (over 50 MB). Please contact support.'
      using errcode = '54000';
  end if;

  insert into public.backups (business_id, size_bytes, status, row_counts, completed_at)
  values (p_business_id, v_size, v_done::public.job_status, v_counts, now())
  returning id into v_id;

  perform public.audit_write(
    p_business_id, 'Backups', 'backups', v_id, 'backup_created',
    format('Created a backup (%s records, %s KB)', v_total, (v_size / 1024)),
    jsonb_build_object('records', v_total, 'size_bytes', v_size));

  return v_out || jsonb_build_object('backup_id', v_id);
end
$fn$;

revoke all on function public.create_backup(uuid) from public, anon, authenticated;
grant execute on function public.create_backup(uuid) to authenticated;