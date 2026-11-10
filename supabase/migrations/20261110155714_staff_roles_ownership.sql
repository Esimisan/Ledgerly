-- ===== Save a role's permissions (replaces the whole set) =====
create function public.set_role_permissions(
  p_business_id uuid, p_role public.business_role, p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_my public.business_role;
  v_clean text[];
  v_bad text;
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

  delete from public.role_permissions where business_id = p_business_id and role = p_role;
  insert into public.role_permissions (business_id, role, permission)
  select p_business_id, p_role, x from unnest(v_clean) x;
end
$fn$;

-- ===== Restore a role to its defaults (same rules as saving) =====
create function public.restore_role_permissions(p_business_id uuid, p_role public.business_role)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform public.set_role_permissions(p_business_id, p_role, public.role_default_permissions(p_role));
end
$fn$;

-- ===== Ownership transfer (atomic) =====
create function public.transfer_ownership(
  p_business_id uuid, p_new_owner uuid, p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null or not exists (
       select 1 from public.business_members m
        where m.business_id = p_business_id and m.user_id = v_uid
          and m.role = 'owner' and m.status = 'active') then
    raise exception 'Only the owner can transfer ownership.' using errcode = '42501';
  end if;
  if p_new_owner = v_uid then
    raise exception 'You already own this business.' using errcode = '22023';
  end if;
  if not exists (
       select 1 from public.business_members m
        where m.business_id = p_business_id and m.user_id = p_new_owner
          and m.role = 'admin' and m.status = 'active') then
    raise exception 'Ownership can only be handed to an active admin. Promote them to admin first.'
      using errcode = '22023';
  end if;
  select b.name into v_name from public.businesses b where b.id = p_business_id for update;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_name)) then
    raise exception 'The name you typed does not match the business name. Nothing was changed.'
      using errcode = '22023';
  end if;

  -- Demote first so the one-owner index is never violated.
  update public.business_members set role = 'admin'
   where business_id = p_business_id and user_id = v_uid;
  update public.business_members set role = 'owner'
   where business_id = p_business_id and user_id = p_new_owner;
  update public.businesses set owner_id = p_new_owner where id = p_business_id;
end
$fn$;

revoke all on function public.set_role_permissions(uuid, public.business_role, text[]) from public, anon, authenticated;
revoke all on function public.restore_role_permissions(uuid, public.business_role) from public, anon, authenticated;
revoke all on function public.transfer_ownership(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.set_role_permissions(uuid, public.business_role, text[]) to authenticated;
grant execute on function public.restore_role_permissions(uuid, public.business_role) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid, text) to authenticated;