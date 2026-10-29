-- Internal helper: the ONE place that applies a stock change.
-- Not callable by clients. record_stock_movement, adjust_stock and, later,
-- create_sale / returns / purchase-order receiving all go through it.
create or replace function public.apply_stock_change(
  p_business_id    uuid,
  p_product_id     uuid,
  p_type           public.stock_movement_type,
  p_quantity_change numeric,
  p_unit_cost      numeric default null,
  p_note           text default null,
  p_reference_type text default null,
  p_reference_id   uuid default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_row     public.stock_movements;
begin
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Quantity must not be zero';
  end if;

  -- quantities are numeric(12,3): refuse extra decimals instead of rounding silently
  if p_quantity_change <> round(p_quantity_change, 3) then
    raise exception 'Quantity can have at most 3 decimal places';
  end if;

  -- Lock the product row so two simultaneous changes cannot both pass the checks below.
  select id, is_active, deleted_at, quantity_on_hand
    into v_product
    from public.products
   where id = p_product_id
     and business_id = p_business_id
   for update;

  if not found then
    raise exception 'Product not found in this business';
  end if;

  if v_product.deleted_at is not null or not v_product.is_active then
    raise exception 'This product is inactive or deleted. Reactivate it before changing its stock';
  end if;

  if v_product.quantity_on_hand + p_quantity_change < 0 then
    raise exception 'Not enough stock: % on hand, so a change of % would go below zero',
      v_product.quantity_on_hand, p_quantity_change;
  end if;

  -- The BEFORE INSERT trigger adds quantity_change to products.quantity_on_hand
  -- and fills balance_after; created_by defaults to auth.uid().
  insert into public.stock_movements (
    business_id, product_id, movement_type, quantity_change,
    unit_cost, note, reference_type, reference_id
  )
  values (
    p_business_id, p_product_id, p_type, p_quantity_change,
    p_unit_cost, p_note, p_reference_type, p_reference_id
  )
  returning * into v_row;

  return v_row;
end;
$$;


-- Manual stock movements: opening stock, stock added (purchase), removal, damage.
-- p_quantity is always POSITIVE; the function applies the sign.
create or replace function public.record_stock_movement(
  p_business_id uuid,
  p_product_id  uuid,
  p_type        public.stock_movement_type,
  p_quantity    numeric,
  p_unit_cost   numeric default null,
  p_note        text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := left(nullif(btrim(p_note), ''), 500);
  v_cost numeric := p_unit_cost;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not public.has_permission(p_business_id, 'inventory.adjust') then
    raise exception 'You do not have permission to change stock';
  end if;

  if p_type not in ('opening_stock', 'purchase', 'removal', 'damage') then
    raise exception 'Movement type % cannot be recorded manually', p_type;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  if p_type in ('removal', 'damage') then
    if v_note is null then
      raise exception 'A note is required when removing or writing off stock';
    end if;
    v_cost := null;  -- cost only makes sense when stock comes in
  end if;

  if v_cost is not null and v_cost < 0 then
    raise exception 'Unit cost cannot be negative';
  end if;

  if p_type = 'opening_stock' and exists (
    select 1 from public.stock_movements m
     where m.business_id = p_business_id
       and m.product_id  = p_product_id
  ) then
    raise exception 'Opening stock can only be set before any other stock movement. Use "Stock added" instead';
  end if;

  return public.apply_stock_change(
    p_business_id,
    p_product_id,
    p_type,
    case when p_type in ('removal', 'damage') then -p_quantity else p_quantity end,
    v_cost,
    v_note
  );
end;
$$;


-- Stock adjustment: the user types what they COUNTED; the function records the difference.
create or replace function public.adjust_stock(
  p_business_id      uuid,
  p_product_id       uuid,
  p_counted_quantity numeric,
  p_note             text
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note    text := left(nullif(btrim(p_note), ''), 500);
  v_current numeric;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not public.has_permission(p_business_id, 'inventory.adjust') then
    raise exception 'You do not have permission to change stock';
  end if;

  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'Counted quantity cannot be negative';
  end if;

  if v_note is null then
    raise exception 'A note is required for a stock adjustment';
  end if;

  select quantity_on_hand
    into v_current
    from public.products
   where id = p_product_id
     and business_id = p_business_id
   for update;

  if not found then
    raise exception 'Product not found in this business';
  end if;

  if p_counted_quantity = v_current then
    raise exception 'The counted quantity matches the current stock, so there is nothing to adjust';
  end if;

  return public.apply_stock_change(
    p_business_id,
    p_product_id,
    'adjustment',
    p_counted_quantity - v_current,
    null,
    v_note
  );
end;
$$;

-- History view. It reads the products TABLE (not products_with_status) so movements
-- of deleted products still show. security_invoker makes RLS apply as the caller.
create or replace view public.stock_movements_with_details
with (security_invoker = true) as
select
  m.id,
  m.business_id,
  m.product_id,
  p.name        as product_name,
  p.sku         as product_sku,
  p.unit        as product_unit,
  p.deleted_at  as product_deleted_at,
  m.movement_type,
  m.quantity_change,
  m.balance_after,
  m.unit_cost,
  m.reference_type,
  m.reference_id,
  m.note,
  m.created_by,
  pr.full_name  as created_by_name,
  m.created_at
from public.stock_movements m
join public.products p
  on p.business_id = m.business_id
 and p.id = m.product_id
left join public.profiles pr
  on pr.id = m.created_by;


  -- Helper: nobody from the client side may call it.
revoke all on function public.apply_stock_change(
  uuid, uuid, public.stock_movement_type, numeric, numeric, text, text, uuid
) from public, anon, authenticated;

-- Public RPCs: signed-in users only (the permission check is inside the function).
revoke all on function public.record_stock_movement(
  uuid, uuid, public.stock_movement_type, numeric, numeric, text
) from public, anon;
grant execute on function public.record_stock_movement(
  uuid, uuid, public.stock_movement_type, numeric, numeric, text
) to authenticated;

revoke all on function public.adjust_stock(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, numeric, text) to authenticated;

-- View: read-only, signed-in users only.
revoke all on public.stock_movements_with_details from public, anon, authenticated;
grant select on public.stock_movements_with_details to authenticated;