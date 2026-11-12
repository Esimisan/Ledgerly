-- 1) My memberships, all statuses, with what the switcher needs.
create or replace function public.my_businesses()
returns table (
  business_id uuid,
  name        text,
  logo_path   text,
  role        public.business_role,
  status      public.member_status
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.business_id, b.name::text, b.logo_path::text, m.role, m.status
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where m.user_id = (select auth.uid())
  order by m.created_at, b.name
$fn$;

revoke all on function public.my_businesses() from public, anon, authenticated;
grant execute on function public.my_businesses() to authenticated;

-- 2) accept_invitation: same checks as before, minus the "already belongs to a business" refusal.
create or replace function public.accept_invitation(p_token text)
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

  insert into public.business_members (business_id, user_id, role, status, invited_by)
  values (i.business_id, v_uid, i.role, 'active', i.invited_by);

  update public.invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = i.id;

  return i.business_id;
end
$fn$;

revoke all on function public.accept_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;