-- ============ purchase_orders ============
create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  po_number     integer not null,
  supplier_id   uuid not null,
  status        public.po_status not null default 'draft',
  ordered_at    timestamptz,
  expected_date date,
  received_at   timestamptz,
  subtotal      numeric(14,2) not null default 0 check (subtotal >= 0),
  shipping_cost numeric(14,2) not null default 0 check (shipping_cost >= 0),
  total         numeric(14,2) not null default 0 check (total >= 0),
  notes         text,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, po_number),
  constraint purchase_orders_total_matches check (total = subtotal + shipping_cost),
  foreign key (business_id, supplier_id) references public.suppliers (business_id, id)
);
create index purchase_orders_business_status_idx
  on public.purchase_orders (business_id, status, created_at desc);
alter table public.purchase_orders enable row level security;
grant select on public.purchase_orders to authenticated;  -- writes via RPC

-- ============ purchase_order_items ============
create table public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  purchase_order_id uuid not null,
  product_id        uuid not null,
  quantity_ordered  numeric(12,3) not null check (quantity_ordered > 0),
  quantity_received numeric(12,3) not null default 0 check (quantity_received >= 0),
  unit_cost         numeric(14,2) not null check (unit_cost >= 0),
  line_total        numeric(14,2) generated always as
                      (round(quantity_ordered * unit_cost, 2)) stored,
  created_at        timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, purchase_order_id)
    references public.purchase_orders (business_id, id) on delete cascade,
  foreign key (business_id, product_id)
    references public.products (business_id, id)
);
create index purchase_order_items_po_idx on public.purchase_order_items (purchase_order_id);
alter table public.purchase_order_items enable row level security;
grant select on public.purchase_order_items to authenticated;

-- ============ expense_categories ============
create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  is_system   boolean not null default false,   -- seeded defaults (Rent, Salaries, ...)
  created_at  timestamptz not null default now(),
  unique (business_id, id)
);
create unique index expense_categories_business_name_key
  on public.expense_categories (business_id, lower(name));
alter table public.expense_categories enable row level security;
grant select, insert, update, delete on public.expense_categories to authenticated;

-- ============ expenses ============
create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  category_id    uuid not null,
  amount         numeric(14,2) not null check (amount > 0),
  expense_date   date not null default current_date,
  description    text,
  vendor         text,
  payment_method public.payment_method,
  receipt_path   text,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, category_id)
    references public.expense_categories (business_id, id)
);
create index expenses_business_date_idx on public.expenses (business_id, expense_date desc);
create index expenses_business_category_idx on public.expenses (business_id, category_id);
alter table public.expenses enable row level security;
grant select, insert, update, delete on public.expenses to authenticated;