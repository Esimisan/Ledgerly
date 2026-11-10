-- ===== Invitations (no client access: everything goes through RPCs) =====
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  role public.business_role not null check (role in ('admin', 'manager', 'staff')),
  token text not null unique
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create unique index invitations_one_pending_idx
  on public.invitations (business_id, email) where status = 'pending';
create index invitations_business_idx
  on public.invitations (business_id, created_at desc);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();
create trigger invitations_lock_business_id
  before update on public.invitations
  for each row execute function public.prevent_business_id_change();

alter table public.invitations enable row level security;
revoke all on public.invitations from public, anon, authenticated;

-- ===== Close the direct write paths (RPCs only from now on) =====
drop policy if exists business_members_update on public.business_members;
drop policy if exists business_members_remove on public.business_members;
drop policy if exists business_members_leave on public.business_members;
revoke delete on public.business_members from anon, authenticated;
revoke update (role, status) on public.business_members from anon, authenticated;

drop policy if exists role_permissions_insert on public.role_permissions;
drop policy if exists role_permissions_update on public.role_permissions;
drop policy if exists role_permissions_delete on public.role_permissions;
revoke insert, update, delete on public.role_permissions from anon, authenticated;

-- ===== Internal helpers (no client grants) =====
create function public.all_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array[
    'audit.view', 'backups.manage', 'customers.adjust', 'customers.write',
    'discounts.manage', 'expenses.manage', 'finance.view', 'import.run',
    'inventory.adjust', 'products.write', 'purchases.manage', 'reports.view',
    'sales.create', 'sales.return', 'sales.void', 'settings.manage',
    'staff.manage', 'suppliers.manage'
  ]
$fn$;

create function public.role_default_permissions(p_role public.business_role)
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select case p_role
    when 'admin' then public.all_permissions()
    when 'manager' then array[
      'products.write', 'inventory.adjust', 'suppliers.manage', 'customers.write',
      'customers.adjust', 'sales.create', 'sales.void', 'sales.return',
      'discounts.manage', 'purchases.manage', 'expenses.manage', 'finance.view',
      'reports.view', 'import.run'
    ]
    when 'staff' then array['sales.create', 'customers.write']
    else array[]::text[]
  end
$fn$;

revoke all on function public.all_permissions() from public, anon, authenticated;
revoke all on function public.role_default_permissions(public.business_role)
  from public, anon, authenticated;