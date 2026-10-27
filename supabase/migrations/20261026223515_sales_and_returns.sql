-- ============ sales ============
create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  sale_number    integer not null,
  customer_id    uuid,                        -- null = walk-in customer
  discount_id    uuid,
  status         public.sale_status not null default 'completed',
  sold_at        timestamptz not null default now(),
  subtotal       numeric(14,2) not null check (subtotal >= 0),      -- sum of line totals
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0), -- order-level
  tax_total      numeric(14,2) not null default 0 check (tax_total >= 0),
  total          numeric(14,2) not null check (total >= 0),
  cost_total     numeric(14,2) not null default 0 check (cost_total >= 0),     -- COGS snapshot
  amount_paid    numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance_due    numeric(14,2) generated always as (total - amount_paid) stored,
  payment_method public.payment_method,
  notes          text,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  voided_at      timestamptz,
  voided_by      uuid references auth.users (id) on delete set null,
  void_reason    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, sale_number),
  constraint sales_total_matches check (total = subtotal - discount_total + tax_total),
  constraint sales_paid_within_total check (amount_paid <= total),
  constraint sales_void_consistent check ((status = 'voided') = (voided_at is not null)),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, discount_id) references public.discounts (business_id, id)
);
create index sales_business_date_idx     on public.sales (business_id, sold_at desc);
create index sales_business_customer_idx on public.sales (business_id, customer_id, sold_at desc);
alter table public.sales enable row level security;
grant select on public.sales to authenticated;   -- writes via create_sale / void_sale RPC

-- ============ sale_items ============
create table public.sale_items (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  sale_id           uuid not null,
  product_id        uuid not null,
  product_name      text not null,                -- snapshot
  product_sku       text,                         -- snapshot
  quantity          numeric(12,3) not null check (quantity > 0),
  unit_price        numeric(14,2) not null check (unit_price >= 0),  -- snapshot
  unit_cost         numeric(14,2) not null check (unit_cost >= 0),   -- snapshot
  discount_amount   numeric(14,2) not null default 0 check (discount_amount >= 0),
  line_total        numeric(14,2) generated always as
                      (round(quantity * unit_price, 2) - discount_amount) stored,
  returned_quantity numeric(12,3) not null default 0,
  created_at        timestamptz not null default now(),
  unique (business_id, id),
  constraint sale_items_discount_within_line
    check (discount_amount <= round(quantity * unit_price, 2)),
  constraint sale_items_returned_within_sold
    check (returned_quantity >= 0 and returned_quantity <= quantity),
  foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete cascade,
  foreign key (business_id, product_id)
    references public.products (business_id, id)
);
create index sale_items_sale_idx    on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (business_id, product_id);
alter table public.sale_items enable row level security;
grant select on public.sale_items to authenticated;

-- ============ sale_payments ============
create table public.sale_payments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_id     uuid not null,
  amount      numeric(14,2) not null check (amount > 0),
  method      public.payment_method not null,
  paid_at     timestamptz not null default now(),
  reference   text,
  note        text,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete cascade
);
create index sale_payments_sale_idx on public.sale_payments (sale_id);
alter table public.sale_payments enable row level security;
grant select on public.sale_payments to authenticated;

-- ============ sale_returns ============
create table public.sale_returns (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  return_number integer not null,
  sale_id       uuid not null,
  customer_id   uuid,
  returned_at   timestamptz not null default now(),
  refund_total  numeric(14,2) not null default 0 check (refund_total >= 0),
  refund_method public.refund_method,
  reason        text,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, return_number),
  foreign key (business_id, sale_id) references public.sales (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id)
);
create index sale_returns_sale_idx on public.sale_returns (sale_id);
alter table public.sale_returns enable row level security;
grant select on public.sale_returns to authenticated;

-- ============ sale_return_items ============
create table public.sale_return_items (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  sale_return_id     uuid not null,
  sale_item_id       uuid not null,
  product_id         uuid not null,
  quantity           numeric(12,3) not null check (quantity > 0),
  refund_unit_amount numeric(14,2) not null check (refund_unit_amount >= 0),
  condition          public.return_condition not null default 'resellable',
  line_total         numeric(14,2) generated always as
                       (round(quantity * refund_unit_amount, 2)) stored,
  created_at         timestamptz not null default now(),
  foreign key (business_id, sale_return_id)
    references public.sale_returns (business_id, id) on delete cascade,
  foreign key (business_id, sale_item_id)
    references public.sale_items (business_id, id),
  foreign key (business_id, product_id)
    references public.products (business_id, id)
);
create index sale_return_items_return_idx on public.sale_return_items (sale_return_id);
alter table public.sale_return_items enable row level security;
grant select on public.sale_return_items to authenticated;