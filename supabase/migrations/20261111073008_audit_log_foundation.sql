-- Reshape (the table has 0 rows)
alter table public.audit_log
  drop column if exists old_data,
  drop column if exists new_data,
  add column if not exists area text not null default 'General',
  add column if not exists summary text not null default '',
  add column if not exists changes jsonb;

alter table public.audit_log
  alter column area drop default,
  alter column summary drop default;

create index if not exists audit_log_area_idx
  on public.audit_log (business_id, area, created_at desc);
create index if not exists audit_log_user_idx
  on public.audit_log (business_id, user_id, created_at desc);

-- Append-only. Statements are blocked for everyone, but the foreign-key actions
-- (user deleted -> user_id set null, business deleted -> cascade) still work.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $fn$
begin
  if tg_op <> 'TRUNCATE' and pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'The audit log cannot be changed.' using errcode = '42501';
end
$fn$;

drop trigger if exists audit_log_immutable_row on public.audit_log;
create trigger audit_log_immutable_row
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- Clients never touch the table; they read through list_audit_log
drop policy if exists audit_log_select on public.audit_log;
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;

-- The one place that inserts audit rows (internal)
create or replace function public.audit_write(
  p_business uuid, p_area text, p_table text, p_record uuid,
  p_action text, p_summary text, p_changes jsonb)
returns void language sql security definer set search_path = ''
as $fn$
  insert into public.audit_log
    (business_id, user_id, area, table_name, record_id, action, summary, changes)
  select p_business, u.id, p_area, p_table, p_record, p_action,
         left(coalesce(p_summary, ''), 500), p_changes
  from (select 1) s
  left join auth.users u on u.id = auth.uid();
$fn$;

create or replace function public.list_audit_log(
  p_business_id uuid,
  p_from date default null,
  p_to date default null,
  p_actor uuid default null,
  p_area text default null,
  p_limit integer default 20,
  p_offset integer default 0)
returns table (
  id bigint, created_at timestamptz, actor_id uuid, actor_name text,
  area text, action text, summary text, changes jsonb, total_count bigint)
language plpgsql stable security definer set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null or not public.has_permission(p_business_id, 'audit.view') then
    raise exception 'You do not have permission to view the audit log.' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'The start date is after the end date.' using errcode = '22023';
  end if;

  select b.timezone into v_tz from public.businesses b where b.id = p_business_id;
  v_tz := coalesce(v_tz, 'UTC');
  if p_from is not null then v_from := p_from::timestamp at time zone v_tz; end if;
  if p_to is not null then v_to := (p_to + 1)::timestamp at time zone v_tz; end if;

  return query
  select a.id, a.created_at, a.user_id,
         coalesce(nullif(btrim(p.full_name), ''),
                  case when a.user_id is null then 'System' else 'Former member' end),
         a.area, a.action, a.summary, a.changes, count(*) over ()
    from public.audit_log a
    left join public.profiles p on p.id = a.user_id
   where a.business_id = p_business_id
     and (v_from is null or a.created_at >= v_from)
     and (v_to is null or a.created_at < v_to)
     and (p_actor is null or a.user_id = p_actor)
     and (p_area is null or a.area = p_area)
   order by a.created_at desc, a.id desc
   limit v_limit offset v_offset;
end
$fn$;

create or replace function public.audit_actor_options(p_business_id uuid)
returns table (user_id uuid, full_name text)
language plpgsql stable security definer set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.has_permission(p_business_id, 'audit.view') then
    raise exception 'You do not have permission to view the audit log.' using errcode = '42501';
  end if;
  return query
  select a.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Former member')
    from (select distinct x.user_id from public.audit_log x
           where x.business_id = p_business_id and x.user_id is not null) a
    left join public.profiles p on p.id = a.user_id
   order by 2;
end
$fn$;

-- Grants: only the two read functions reach clients
revoke all on function public.audit_log_immutable() from public, anon, authenticated;
revoke all on function public.audit_write(uuid, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.list_audit_log(uuid, date, date, uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.audit_actor_options(uuid) from public, anon, authenticated;
grant execute on function public.list_audit_log(uuid, date, date, uuid, text, integer, integer)
  to authenticated;
grant execute on function public.audit_actor_options(uuid) to authenticated;