create table public.subscription_plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  price_monthly    numeric(14,2) not null default 0 check (price_monthly >= 0),
  price_yearly     numeric(14,2) not null default 0 check (price_yearly >= 0),
  currency_code    char(3) not null default 'NGN',
  max_staff        integer check (max_staff > 0),      -- null = unlimited
  max_products     integer check (max_products > 0),   -- null = unlimited
  provider_plan_code text,                             -- Paystack/Flutterwave plan id
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
alter table public.subscription_plans enable row level security;
grant select on public.subscription_plans to authenticated;

-- Placeholder plan so every new business can have a subscription row.
-- Real paid plans, prices and limits are decided in Step 14.
insert into public.subscription_plans (code, name) values ('free', 'Free');

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  business_id               uuid not null unique
                              references public.businesses (id) on delete cascade,
  plan_id                   uuid not null references public.subscription_plans (id),
  status                    public.subscription_status not null default 'trialing',
  provider                  text,
  provider_customer_code    text,
  provider_subscription_code text,
  trial_ends_at             timestamptz,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
grant select on public.subscriptions to authenticated;   -- writes: webhook only

create table public.billing_events (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid references public.businesses (id) on delete set null,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (provider, provider_event_id)
);
alter table public.billing_events enable row level security;
-- Intentionally NO grants: only the Edge Function (service role) touches it.