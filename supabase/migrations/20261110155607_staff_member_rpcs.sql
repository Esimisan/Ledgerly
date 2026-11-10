-- ===== Members list (emails are only readable here) =====
create function public.list_staff_members(p_business_id uuid)
returns table (
  user_id uuid, full_name text, email text, role public.business_role,
  status public.member_status, joined_at timestamptz, is_me boolean, can_manage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_my public.business_role;
begin
  if v_uid is null or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'You do not have permission to manage staff.' using errcode = '42501';
  end if;
  select m.role into v_my from public.business_members m
   where m.business_id = p_business_id and m.user_id = v_uid;

  return query
  select m.user_id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))::text,
         u.email::text, m.role, m.status, m.created_at,
         (m.user_id = v_uid),
         (m.role <> 'owner' and m.user_id <> v_uid
           and (v_my = 'owner' or m.role in ('manager', 'staff')))
  from public.business_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.business_id = p_business_id
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,
           m.created_at;
end
$fn$;

-- ===== Change role =====
create function public.set_member_role(
  p_business_id uuid, p_user_id uuid, p_role public.business_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_my public.business_role;
  v_target public.business_role;
begin
  if v_uid is null or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'You do not have permission to manage staff.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'manager', 'staff') then
    raise exception 'Choose admin, manager or staff. Use Transfer ownership to change the owner.'
      using errcode = '22023';
  end if;

  select m.role into v_target from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id for update;
  if not found then
    raise exception 'That person is not a member of this business.' using errcode = '22023';
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;
  if v_target = 'owner' then
    raise exception 'The owner''s role cannot be changed. Use Transfer ownership instead.'
      using errcode = '42501';
  end if;

  select m.role into v_my from public.business_members m
   where m.business_id = p_business_id and m.user_id = v_uid;
  if v_my <> 'owner'
     and (v_target not in ('manager', 'staff') or p_role not in ('manager', 'staff')) then
    raise exception 'Only the owner can change admins or make someone an admin.'
      using errcode = '42501';
  end if;
  if v_target = p_role then
    raise exception 'That person already has this role.' using errcode = '22023';
  end if;

  update public.business_members set role = p_role
   where business_id = p_business_id and user_id = p_user_id;

  if not exists (select 1 from public.business_members
                  where business_id = p_business_id and role = 'owner' and status = 'active') then
    raise exception 'The business must always have an active owner.' using errcode = '22023';
  end if;
end
$fn$;

-- ===== Suspend / reactivate =====
create function public.set_member_status(
  p_business_id uuid, p_user_id uuid, p_status public.member_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_my public.business_role;
  v_target public.business_role;
  v_cur public.member_status;
begin
  if v_uid is null or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'You do not have permission to manage staff.' using errcode = '42501';
  end if;

  select m.role, m.status into v_target, v_cur from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id for update;
  if not found then
    raise exception 'That person is not a member of this business.' using errcode = '22023';
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot suspend or reactivate yourself.' using errcode = '42501';
  end if;
  if v_target = 'owner' then
    raise exception 'The owner cannot be suspended.' using errcode = '42501';
  end if;

  select m.role into v_my from public.business_members m
   where m.business_id = p_business_id and m.user_id = v_uid;
  if v_my <> 'owner' and v_target not in ('manager', 'staff') then
    raise exception 'Only the owner can suspend or reactivate an admin.' using errcode = '42501';
  end if;
  if v_cur = p_status then
    raise exception 'That person is already %.', p_status::text using errcode = '22023';
  end if;

  update public.business_members set status = p_status
   where business_id = p_business_id and user_id = p_user_id;
end
$fn$;

-- ===== Create invitation =====
create function public.create_invitation(
  p_business_id uuid, p_email text, p_role public.business_role, p_days integer default 7
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_my public.business_role;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_token text;
  v_exp timestamptz;
begin
  if v_uid is null or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'You do not have permission to manage staff.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if p_role not in ('admin', 'manager', 'staff') then
    raise exception 'Choose admin, manager or staff.' using errcode = '22023';
  end if;
  select m.role into v_my from public.business_members m
   where m.business_id = p_business_id and m.user_id = v_uid;
  if v_my <> 'owner' and p_role = 'admin' then
    raise exception 'Only the owner can invite an admin.' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (1, 7, 30) then
    raise exception 'Choose an expiry of 1, 7 or 30 days.' using errcode = '22023';
  end if;

  if exists (select 1 from public.business_members m
             join auth.users u on u.id = m.user_id
             where m.business_id = p_business_id and lower(u.email) = v_email) then
    raise exception 'That email already belongs to a member of this business. If their access is suspended, reactivate them instead.'
      using errcode = '22023';
  end if;

  update public.invitations i set status = 'expired'
   where i.business_id = p_business_id and i.status = 'pending' and i.expires_at <= now();

  if exists (select 1 from public.invitations i
             where i.business_id = p_business_id and i.email = v_email and i.status = 'pending') then
    raise exception 'There is already a pending invitation for that email. Revoke it first to create a new one.'
      using errcode = '22023';
  end if;

  insert into public.invitations (business_id, email, role, expires_at, invited_by)
  values (p_business_id, v_email, p_role, now() + make_interval(days => p_days), v_uid)
  returning invitations.id, invitations.token, invitations.expires_at
  into v_id, v_token, v_exp;

  return query select v_id, v_token, v_exp;
end
$fn$;

-- ===== List invitations (token only for live pending ones) =====
create function public.list_invitations(p_business_id uuid)
returns table (
  id uuid, email text, role public.business_role, status public.invitation_status,
  token text, expires_at timestamptz, created_at timestamptz, invited_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'You do not have permission to manage staff.' using errcode = '42501';
  end if;
  return query
  select i.id, i.email, i.role,
         (case when i.status = 'pending' and i.expires_at <= now()
               then 'expired' else i.status::text end)::public.invitation_status,
         case when i.status = 'pending' and i.expires_at > now() then i.token else null end,
         i.expires_at, i.created_at,
         coalesce(nullif(btrim(p.full_name), ''), 'Unknown')::text
  from public.invitations i
  left join public.profiles p on p.id = i.invited_by
  where i.business_id = p_business_id
  order by i.created_at desc
  limit 50;
end
$fn$;

-- ===== Revoke =====
create function public.revoke_invitation(p_business_id uuid, p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_my public.business_role;
  v_status public.invitation_status;
  v_role public.business_role;
  v_exp timestamptz;
begin
  if v_uid is null or not public.has_permission(p_business_id, 'staff.manage') then
    raise exception 'You do not have permission to manage staff.' using errcode = '42501';
  end if;
  select i.status, i.role, i.expires_at into v_status, v_role, v_exp
    from public.invitations i
   where i.id = p_invitation_id and i.business_id = p_business_id for update;
  if not found then
    raise exception 'That invitation was not found.' using errcode = '22023';
  end if;
  select m.role into v_my from public.business_members m
   where m.business_id = p_business_id and m.user_id = v_uid;
  if v_my <> 'owner' and v_role = 'admin' then
    raise exception 'Only the owner can revoke an invitation for an admin.' using errcode = '42501';
  end if;
  if v_status = 'accepted' then
    raise exception 'This invitation was already accepted.' using errcode = '22023';
  elsif v_status = 'revoked' then
    raise exception 'This invitation was already revoked.' using errcode = '22023';
  elsif v_status = 'expired' or v_exp <= now() then
    raise exception 'This invitation has already expired.' using errcode = '22023';
  end if;
  update public.invitations set status = 'revoked', revoked_at = now()
   where id = p_invitation_id;
end
$fn$;

-- ===== Invitee side: preview and accept (signed-in users only) =====
create function public.get_invitation_preview(p_token text)
returns table (
  state text, business_name text, role public.business_role,
  email text, expires_at timestamptz, email_matches boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  i public.invitations%rowtype;
  v_mail text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Sign in to view this invitation.' using errcode = '28000';
  end if;
  select * into i from public.invitations where invitations.token = p_token;
  if not found then
    return query select 'not_found'::text, null::text, null::public.business_role,
                        null::text, null::timestamptz, false;
    return;
  end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_uid;
  select b.name into v_name from public.businesses b where b.id = i.business_id;
  return query select
    (case when i.status = 'pending' and i.expires_at <= now()
          then 'expired' else i.status::text end)::text,
    v_name::text, i.role, i.email, i.expires_at, (v_mail = i.email);
end
$fn$;

create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  i public.invitations%rowtype;
  v_mail text;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '28000';
  end if;
  select * into i from public.invitations where token = p_token for update;
  if not found then
    raise exception 'This invitation link is not valid.' using errcode = '22023';
  end if;
  if i.status = 'revoked' then
    raise exception 'This invitation was revoked. Ask the business owner for a new one.'
      using errcode = '22023';
  elsif i.status = 'accepted' then
    raise exception 'This invitation has already been used.' using errcode = '22023';
  elsif i.status = 'expired' or i.expires_at <= now() then
    raise exception 'This invitation has expired. Ask the business owner for a new one.'
      using errcode = '22023';
  end if;

  select lower(u.email) into v_mail from auth.users u where u.id = v_uid;
  if v_mail is distinct from i.email then
    raise exception 'This invitation was sent to a different email address. Sign in with the invited email.'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.business_members m
             where m.business_id = i.business_id and m.user_id = v_uid and m.status = 'suspended') then
    raise exception 'Your access to this business is suspended. Contact the owner.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.business_members m
             where m.business_id = i.business_id and m.user_id = v_uid) then
    raise exception 'You are already a member of this business.' using errcode = '22023';
  end if;
  if exists (select 1 from public.business_members m
             where m.user_id = v_uid and m.status = 'active') then
    raise exception 'This account already belongs to a business. Use a new account for this invitation (switching businesses is coming later).'
      using errcode = '22023';
  end if;

  insert into public.business_members (business_id, user_id, role, status, invited_by)
  values (i.business_id, v_uid, i.role, 'active', i.invited_by);

  update public.invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = i.id;

  return i.business_id;
end
$fn$;

-- ===== For the locked-out screen =====
create function public.my_membership_state()
returns table (
  business_id uuid, business_name text, role public.business_role, status public.member_status
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.business_id, b.name::text, m.role, m.status
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where m.user_id = (select auth.uid())
$fn$;

-- ===== Grants: authenticated only =====
revoke all on function public.list_staff_members(uuid) from public, anon, authenticated;
revoke all on function public.set_member_role(uuid, uuid, public.business_role) from public, anon, authenticated;
revoke all on function public.set_member_status(uuid, uuid, public.member_status) from public, anon, authenticated;
revoke all on function public.create_invitation(uuid, text, public.business_role, integer) from public, anon, authenticated;
revoke all on function public.list_invitations(uuid) from public, anon, authenticated;
revoke all on function public.revoke_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_invitation_preview(text) from public, anon, authenticated;
revoke all on function public.accept_invitation(text) from public, anon, authenticated;
revoke all on function public.my_membership_state() from public, anon, authenticated;

grant execute on function public.list_staff_members(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.business_role) to authenticated;
grant execute on function public.set_member_status(uuid, uuid, public.member_status) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.business_role, integer) to authenticated;
grant execute on function public.list_invitations(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid, uuid) to authenticated;
grant execute on function public.get_invitation_preview(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.my_membership_state() to authenticated;