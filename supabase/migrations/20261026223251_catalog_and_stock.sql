-- ============ categories ============
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, id)
);
create unique index categories_business_name_key
  on public.categories (business_id, lower(name));
alter table public.categories enable row level security;
grant select, insert, update, delete on public.categories to authenticated;

-- ============ suppliers ============
create table public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null check (char_length(trim(name)) > 0),
  contact_name text,
  phone        text,
  email        text,
  address      text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, id)
);
create index suppliers_business_name_idx on public.suppliers (business_id, name);
alter table public.suppliers enable row level security;
grant select, insert, update, delete on public.suppliers to authenticated;

-- ============ products ============
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  category_id      uuid,
  supplier_id      uuid,
  name             text not null check (char_length(trim(name)) > 0),
  sku              text,
  barcode          text,
  description      text,
  unit             text not null default 'pcs',
  cost_price       numeric(14,2) not null default 0 check (cost_price >= 0),
  selling_price    numeric(14,2) not null default 0 check (selling_price >= 0),
  quantity_on_hand numeric(12,3) not null default 0,
  min_stock_level  numeric(12,3) not null default 0 check (min_stock_level >= 0),
  image_path       text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (business_id, id),
  constraint products_stock_not_negative check (quantity_on_hand >= 0),
  foreign key (business_id, category_id)
    references public.categories (business_id, id) on delete set null (category_id),
  foreign key (business_id, supplier_id)
    references public.suppliers (business_id, id) on delete set null (supplier_id)
);
create unique index products_business_sku_key
  on public.products (business_id, lower(sku)) where sku is not null;
create index products_business_name_idx     on public.products (business_id, name);
create index products_business_category_idx on public.products (business_id, category_id);
create index products_low_stock_idx
  on public.products (business_id) where quantity_on_hand <= min_stock_level;
alter table public.products enable row level security;
grant select, delete on public.products to authenticated;
-- Column-level grants: quantity_on_hand is NOT writable by clients.
grant insert (business_id, category_id, supplier_id, name, sku, barcode, description,
              unit, cost_price, selling_price, min_stock_level, image_path, is_active)
  on public.products to authenticated;
grant update (category_id, supplier_id, name, sku, barcode, description, unit,
              cost_price, selling_price, min_stock_level, image_path, is_active)
  on public.products to authenticated;

-- ============ stock_movements (ledger) ============
create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  product_id      uuid not null,
  movement_type   public.stock_movement_type not null,
  quantity_change numeric(12,3) not null check (quantity_change <> 0),
  balance_after   numeric(12,3) not null,          -- filled by the trigger below
  unit_cost       numeric(14,2) check (unit_cost >= 0),
  reference_type  text,                            -- e.g. 'sale', 'purchase_order'
  reference_id    uuid,
  note            text,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, product_id)
    references public.products (business_id, id),
  constraint stock_movements_sign_matches_type check (
    (movement_type in ('opening_stock', 'purchase', 'sale_return') and quantity_change > 0)
    or (movement_type in ('sale', 'damage', 'removal') and quantity_change < 0)
    or movement_type = 'adjustment'
  )
);
create index stock_movements_product_idx
  on public.stock_movements (business_id, product_id, created_at desc);
create index stock_movements_business_date_idx
  on public.stock_movements (business_id, created_at desc);
alter table public.stock_movements enable row level security;
grant select on public.stock_movements to authenticated;  -- writes via RPC only

-- Applies each movement to the product's cached quantity and records the result.
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
     set quantity_on_hand = quantity_on_hand + new.quantity_change
   where id = new.product_id
     and business_id = new.business_id
  returning quantity_on_hand into new.balance_after;

  if not found then
    raise exception 'Product % not found in this business', new.product_id;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_stock_movement() from public, anon, authenticated;

create trigger stock_movements_apply
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();