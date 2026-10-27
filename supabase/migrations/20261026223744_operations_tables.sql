-- ============ audit_log ============
create table public.audit_log (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null,                 -- 'insert' | 'update' | 'delete' | custom
  table_name  text not null,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_business_date_idx on public.audit_log (business_id, created_at desc);
create index audit_log_record_idx on public.audit_log (business_id, table_name, record_id);
alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;   -- written by triggers (Step 13)

-- ============ backups ============
create table public.backups (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  file_path    text,
  size_bytes   bigint check (size_bytes >= 0),
  status       public.job_status not null default 'queued',
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index backups_business_idx on public.backups (business_id, created_at desc);
alter table public.backups enable row level security;
grant select on public.backups to authenticated;     -- created via RPC

-- ============ import_jobs ============
create table public.import_jobs (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  kind           text not null check (kind in ('products', 'customers', 'suppliers', 'expenses')),
  file_name      text,
  status         public.job_status not null default 'queued',
  total_rows     integer not null default 0 check (total_rows >= 0),
  succeeded_rows integer not null default 0 check (succeeded_rows >= 0),
  failed_rows    integer not null default 0 check (failed_rows >= 0),
  errors         jsonb not null default '[]'::jsonb,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index import_jobs_business_idx on public.import_jobs (business_id, created_at desc);
alter table public.import_jobs enable row level security;
grant select on public.import_jobs to authenticated;  -- created via RPC

-- ============ updated_at triggers ============
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'businesses', 'business_members', 'subscriptions',
    'categories', 'suppliers', 'products', 'customers', 'discounts',
    'sales', 'purchase_orders', 'expenses'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;