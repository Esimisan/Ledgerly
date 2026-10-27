-- ============ profiles ============
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;

-- ============ businesses ============
create table public.businesses (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(trim(name)) between 1 and 120),
  owner_id          uuid not null references auth.users (id) on delete restrict,
  currency_code     char(3) not null default 'NGN',
  currency_symbol   text not null default '₦',
  timezone          text not null default 'Africa/Lagos',
  phone             text,
  email             text,
  address           text,
  logo_path         text,
  default_tax_rate  numeric(5,2) not null default 0
                      check (default_tax_rate between 0 and 100),
  receipt_footer    text,
  low_stock_default numeric(12,3) not null default 10 check (low_stock_default >= 0),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses (owner_id);
alter table public.businesses enable row level security;
-- No insert grant: a create_business() function in Step 3 will create the
-- business, owner membership and defaults atomically.
grant select on public.businesses to authenticated;
grant update (name, currency_code, currency_symbol, timezone, phone, email, address,
              logo_path, default_tax_rate, receipt_footer, low_stock_default)
  on public.businesses to authenticated;

-- ============ business_members ============
create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.business_role not null default 'staff',
  status      public.member_status not null default 'active',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);
-- Exactly one owner per business
create unique index business_members_one_owner_idx
  on public.business_members (business_id) where role = 'owner';
alter table public.business_members enable row level security;
-- Inserts happen through RPC (create_business / accept_invitation)
grant select, delete on public.business_members to authenticated;
grant update (role, status) on public.business_members to authenticated;

-- ============ role_permissions ============
create table public.role_permissions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  role        public.business_role not null,
  permission  text not null check (char_length(permission) > 0),
  primary key (business_id, role, permission)
);
alter table public.role_permissions enable row level security;
grant select, insert, update, delete on public.role_permissions to authenticated;

-- ============ business_invitations ============
create table public.business_invitations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email       text not null check (email = lower(email)),
  role        public.business_role not null default 'staff' check (role <> 'owner'),
  status      public.invitation_status not null default 'pending',
  invited_by  uuid references auth.users (id) on delete set null default auth.uid(),
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now()
);
create unique index business_invitations_pending_idx
  on public.business_invitations (business_id, email) where status = 'pending';
alter table public.business_invitations enable row level security;
grant select, insert, update, delete on public.business_invitations to authenticated;

-- ============ document_counters (internal) ============
create table public.document_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind        public.document_kind not null,
  last_number integer not null default 0,
  primary key (business_id, kind)
);
alter table public.document_counters enable row level security;
-- Intentionally NO grants: only our own functions touch this table.

create or replace function public.next_document_number(
  p_business_id uuid, p_kind public.document_kind)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  insert into public.document_counters as dc (business_id, kind, last_number)
  values (p_business_id, p_kind, 1)
  on conflict (business_id, kind)
  do update set last_number = dc.last_number + 1
  returning dc.last_number into v_next;
  return v_next;
end;
$$;
-- Only other database functions (create_sale etc.) may call it
revoke all on function public.next_document_number(uuid, public.document_kind)
  from public, anon, authenticated;