-- ============ customers ============
create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null check (char_length(trim(name)) > 0),
  phone            text,
  email            text,
  address          text,
  notes            text,
  discount_percent numeric(5,2) not null default 0
                     check (discount_percent between 0 and 100),
  -- Maintained by functions/triggers, never by the client:
  balance          numeric(14,2) not null default 0,   -- >0 owes us, <0 store credit
  total_orders     integer       not null default 0 check (total_orders >= 0),
  total_spent      numeric(14,2) not null default 0 check (total_spent >= 0),
  last_purchase_at timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),   -- "date joined"
  updated_at       timestamptz not null default now(),
  unique (business_id, id)
);
create unique index customers_business_phone_key
  on public.customers (business_id, phone) where phone is not null;
create index customers_business_name_idx on public.customers (business_id, name);
create index customers_last_purchase_idx
  on public.customers (business_id, last_purchase_at desc);
alter table public.customers enable row level security;
grant select, delete on public.customers to authenticated;
grant insert (business_id, name, phone, email, address, notes, discount_percent, is_active)
  on public.customers to authenticated;
grant update (name, phone, email, address, notes, discount_percent, is_active)
  on public.customers to authenticated;

-- ============ discounts ============
create table public.discounts (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null check (char_length(trim(name)) > 0),
  code             text,
  discount_type    public.discount_type not null,
  value            numeric(14,2) not null check (value > 0),
  min_order_amount numeric(14,2) not null default 0 check (min_order_amount >= 0),
  starts_at        timestamptz,
  ends_at          timestamptz,
  usage_limit      integer check (usage_limit > 0),
  times_used       integer not null default 0 check (times_used >= 0),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (business_id, id),
  check (discount_type <> 'percent' or value <= 100),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create unique index discounts_business_code_key
  on public.discounts (business_id, lower(code)) where code is not null;
alter table public.discounts enable row level security;
grant select, delete on public.discounts to authenticated;
grant insert (business_id, name, code, discount_type, value, min_order_amount,
              starts_at, ends_at, usage_limit, is_active)
  on public.discounts to authenticated;
grant update (name, code, discount_type, value, min_order_amount,
              starts_at, ends_at, usage_limit, is_active)
  on public.discounts to authenticated;