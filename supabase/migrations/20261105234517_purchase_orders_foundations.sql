
-- 1. Cancel details (purchase orders are cancel-only, never deleted)
alter table public.purchase_orders
  add column cancelled_at  timestamptz,
  add column cancelled_by  uuid references auth.users (id) on delete set null,
  add column cancel_reason text;

alter table public.purchase_orders
  add constraint purchase_orders_cancel_consistent check (
    (status = 'cancelled') = (cancelled_at is not null)
    and (cancelled_at is not null or (cancelled_by is null and cancel_reason is null))
  ),
  add constraint purchase_orders_cancel_reason_length
    check (cancel_reason is null or char_length(cancel_reason) <= 500),
  add constraint purchase_orders_notes_length
    check (notes is null or char_length(notes) <= 500);

create index purchase_orders_supplier_idx
  on public.purchase_orders (business_id, supplier_id, created_at desc);
create index purchase_orders_created_by_idx on public.purchase_orders (created_by);
create index purchase_orders_cancelled_by_idx on public.purchase_orders (cancelled_by);

-- 2. Lines: one line per product, received never above ordered
alter table public.purchase_order_items
  add constraint purchase_order_items_received_within_ordered
  check (quantity_received <= quantity_ordered);

create unique index purchase_order_items_po_product_key
  on public.purchase_order_items (purchase_order_id, product_id);
create index purchase_order_items_product_idx
  on public.purchase_order_items (business_id, product_id);

-- 3. A received or cancelled order is frozen (even for the database owner)
create function public.guard_purchase_order_terminal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('received', 'cancelled') then
    raise exception 'This purchase order is % and can no longer be changed', old.status;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_purchase_order_terminal() from public, anon, authenticated;

create trigger purchase_orders_guard_terminal
  before update on public.purchase_orders
  for each row execute function public.guard_purchase_order_terminal();

-- 4. Receipts: one row per delivery, one row per line delivered
create table public.purchase_receipts (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  purchase_order_id uuid not null,
  received_at       timestamptz not null default now(),
  reference         text,
  note              text,
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint purchase_receipts_business_id_id_key unique (business_id, id),
  constraint purchase_receipts_po_fkey
    foreign key (business_id, purchase_order_id)
    references public.purchase_orders (business_id, id),
  constraint purchase_receipts_reference_length
    check (reference is null or char_length(reference) <= 100),
  constraint purchase_receipts_note_length
    check (note is null or char_length(note) <= 500)
);

create table public.purchase_receipt_items (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  purchase_receipt_id    uuid not null,
  purchase_order_item_id uuid not null,
  product_id             uuid not null,
  quantity               numeric(12,3) not null check (quantity > 0),
  unit_cost              numeric(14,2) not null check (unit_cost >= 0),
  line_total             numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  created_at             timestamptz not null default now(),
  constraint purchase_receipt_items_receipt_fkey
    foreign key (business_id, purchase_receipt_id)
    references public.purchase_receipts (business_id, id),
  constraint purchase_receipt_items_item_fkey
    foreign key (business_id, purchase_order_item_id)
    references public.purchase_order_items (business_id, id),
  constraint purchase_receipt_items_product_fkey
    foreign key (business_id, product_id)
    references public.products (business_id, id)
);

create index purchase_receipts_po_idx
  on public.purchase_receipts (business_id, purchase_order_id, received_at desc);
create index purchase_receipts_created_by_idx on public.purchase_receipts (created_by);
create index purchase_receipt_items_receipt_idx
  on public.purchase_receipt_items (business_id, purchase_receipt_id);
create index purchase_receipt_items_item_idx
  on public.purchase_receipt_items (business_id, purchase_order_item_id);
create index purchase_receipt_items_product_idx
  on public.purchase_receipt_items (business_id, product_id);

-- 5. RLS: read needs purchases.manage; nobody writes directly (functions only)
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

create policy purchase_receipts_select on public.purchase_receipts
  for select to authenticated
  using (public.has_permission(business_id, 'purchases.manage'));

create policy purchase_receipt_items_select on public.purchase_receipt_items
  for select to authenticated
  using (public.has_permission(business_id, 'purchases.manage'));

revoke all on public.purchase_receipts, public.purchase_receipt_items
  from public, anon, authenticated;
grant select on public.purchase_receipts, public.purchase_receipt_items to authenticated;

-- 6. Views (security_invoker, so the policies above apply to the reader)
create view public.purchase_orders_with_details
with (security_invoker = true) as
select
  po.id,
  po.business_id,
  po.po_number,
  'PO-' || lpad(po.po_number::text, greatest(4, length(po.po_number::text)), '0') as po_label,
  po.supplier_id,
  sp.name      as supplier_name,
  sp.is_active as supplier_is_active,
  po.status,
  po.expected_date,
  po.ordered_at,
  po.received_at,
  po.subtotal,
  po.shipping_cost,
  po.total,
  po.notes,
  po.created_by,
  cp.full_name as created_by_name,
  po.created_at,
  po.updated_at,
  po.cancelled_at,
  po.cancelled_by,
  xp.full_name as cancelled_by_name,
  po.cancel_reason,
  coalesce(i.item_count, 0)                as item_count,
  coalesce(i.qty_ordered, 0::numeric)      as quantity_ordered_total,
  coalesce(i.qty_received, 0::numeric)     as quantity_received_total,
  coalesce(r.receipt_count, 0)             as receipt_count,
  coalesce(r.received_value, 0::numeric)   as received_value
from public.purchase_orders po
  join public.suppliers sp on sp.business_id = po.business_id and sp.id = po.supplier_id
  left join public.profiles cp on cp.id = po.created_by
  left join public.profiles xp on xp.id = po.cancelled_by
  left join lateral (
    select count(*)::integer as item_count,
           sum(pi.quantity_ordered) as qty_ordered,
           sum(pi.quantity_received) as qty_received
      from public.purchase_order_items pi
     where pi.business_id = po.business_id and pi.purchase_order_id = po.id
  ) i on true
  left join lateral (
    select count(distinct rc.id)::integer as receipt_count,
           sum(ri.line_total) as received_value
      from public.purchase_receipts rc
      left join public.purchase_receipt_items ri
        on ri.business_id = rc.business_id and ri.purchase_receipt_id = rc.id
     where rc.business_id = po.business_id and rc.purchase_order_id = po.id
  ) r on true;

create view public.purchase_order_items_with_details
with (security_invoker = true) as
select
  pi.id,
  pi.business_id,
  pi.purchase_order_id,
  pi.product_id,
  p.name       as product_name,
  p.sku        as product_sku,
  p.unit       as product_unit,
  p.is_active  as product_is_active,
  p.deleted_at as product_deleted_at,
  p.cost_price as current_cost_price,
  pi.quantity_ordered,
  pi.quantity_received,
  pi.quantity_ordered - pi.quantity_received as quantity_remaining,
  pi.unit_cost,
  pi.line_total,
  pi.created_at
from public.purchase_order_items pi
  join public.products p on p.business_id = pi.business_id and p.id = pi.product_id;

create view public.purchase_receipts_with_details
with (security_invoker = true) as
select
  rc.id,
  rc.business_id,
  rc.purchase_order_id,
  rc.received_at,
  rc.reference,
  rc.note,
  rc.created_by,
  pr.full_name as created_by_name,
  coalesce(t.line_count, 0)              as line_count,
  coalesce(t.total_quantity, 0::numeric) as total_quantity,
  coalesce(t.total_value, 0::numeric)    as total_value
from public.purchase_receipts rc
  left join public.profiles pr on pr.id = rc.created_by
  left join lateral (
    select count(*)::integer as line_count,
           sum(ri.quantity) as total_quantity,
           sum(ri.line_total) as total_value
      from public.purchase_receipt_items ri
     where ri.business_id = rc.business_id and ri.purchase_receipt_id = rc.id
  ) t on true;

revoke all on
  public.purchase_orders_with_details,
  public.purchase_order_items_with_details,
  public.purchase_receipts_with_details
  from public, anon, authenticated;
grant select on
  public.purchase_orders_with_details,
  public.purchase_order_items_with_details,
  public.purchase_receipts_with_details
  to authenticated;