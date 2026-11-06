-- Internal: validates and prices a list of lines. Not callable by clients.
create function public.po_normalize_lines(p_business_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_elem     jsonb;
  v_pid      uuid;
  v_qty      numeric;
  v_cost     numeric;
  v_seen     uuid[] := '{}';
  v_count    integer;
  v_bad      text;
  v_lines    jsonb;
  v_subtotal numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product to the purchase order';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A purchase order can have at most 200 different products';
  end if;

  for v_elem in select e.value from jsonb_array_elements(p_items) e loop
    begin
      v_pid  := (v_elem->>'product_id')::uuid;
      v_qty  := (v_elem->>'quantity')::numeric;
      v_cost := (v_elem->>'unit_cost')::numeric;
    exception when others then
      raise exception 'Each line needs a valid product, quantity and unit cost';
    end;
    if v_pid is null or v_qty is null or v_cost is null then
      raise exception 'Each line needs a valid product, quantity and unit cost';
    end if;
    if v_qty >= 1000000000 then raise exception 'A quantity is too large'; end if;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'Quantity can have at most 3 decimal places';
    end if;
    if v_cost < 0 then raise exception 'A unit cost cannot be negative'; end if;
    if v_cost >= 1000000000 then raise exception 'A unit cost is too large'; end if;
    if v_cost <> round(v_cost, 2) then
      raise exception 'Unit costs can have at most 2 decimal places';
    end if;
    if v_pid = any (v_seen) then
      raise exception 'The same product appears twice. Combine it into one line';
    end if;
    v_seen := v_seen || v_pid;
  end loop;

  select count(*) into v_count
    from public.products p
   where p.business_id = p_business_id and p.id = any (v_seen);
  if v_count <> array_length(v_seen, 1) then
    raise exception 'One or more products were not found in this business';
  end if;

  select p.name into v_bad
    from public.products p
   where p.business_id = p_business_id
     and p.id = any (v_seen)
     and (not p.is_active or p.deleted_at is not null)
   limit 1;
  if v_bad is not null then
    raise exception '"%" is inactive or deleted. Reactivate it or remove it from the order', v_bad;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'product_id',   p.id,
             'product_name', p.name,
             'quantity',     t.qty,
             'unit_cost',    t.cost)
           order by t.ord)
    into v_lines
    from (select x.ord,
                 (x.e->>'product_id')::uuid as pid,
                 (x.e->>'quantity')::numeric as qty,
                 (x.e->>'unit_cost')::numeric as cost
            from jsonb_array_elements(p_items) with ordinality as x(e, ord)) t
    join public.products p on p.id = t.pid and p.business_id = p_business_id;

  select coalesce(sum(round(l.quantity * l.unit_cost, 2)), 0)
    into v_subtotal
    from jsonb_to_recordset(v_lines) as l(quantity numeric, unit_cost numeric);

  return jsonb_build_object('lines', v_lines, 'subtotal', v_subtotal);
end;
$fn$;

-- Create (p_purchase_order_id null) or edit a DRAFT. p_place = true also places it.
create function public.save_purchase_order(
  p_business_id       uuid,
  p_purchase_order_id uuid,
  p_supplier_id       uuid,
  p_items             jsonb,
  p_expected_date     date    default null,
  p_shipping_cost     numeric default 0,
  p_notes             text    default null,
  p_place             boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_notes    text := nullif(btrim(coalesce(p_notes, '')), '');
  v_ship     numeric := coalesce(p_shipping_cost, 0);
  v_place    boolean := coalesce(p_place, false);
  v_supplier record;
  v_po       record;
  v_norm     jsonb;
  v_subtotal numeric;
  v_status   public.po_status;
  v_id       uuid;
  v_number   integer;
  v_label    text;
begin
  if not public.has_permission(p_business_id, 'purchases.manage') then
    raise exception 'You do not have permission to manage purchase orders' using errcode = '42501';
  end if;

  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'Notes can be at most 500 characters';
  end if;
  if v_ship < 0 then raise exception 'Shipping cost cannot be negative'; end if;
  if v_ship >= 1000000000 then raise exception 'The shipping cost is too large'; end if;
  if v_ship <> round(v_ship, 2) then
    raise exception 'Shipping cost can have at most 2 decimal places';
  end if;

  select s.id, s.name, s.is_active into v_supplier
    from public.suppliers s
   where s.id = p_supplier_id and s.business_id = p_business_id;
  if not found then raise exception 'Supplier not found in this business'; end if;
  if not v_supplier.is_active then
    raise exception '"%" is inactive. Reactivate the supplier first', v_supplier.name;
  end if;

  if p_purchase_order_id is not null then
    select po.id, po.po_number, po.status into v_po
      from public.purchase_orders po
     where po.id = p_purchase_order_id and po.business_id = p_business_id
       for update;
    if not found then raise exception 'Purchase order not found in this business'; end if;
    v_label := 'PO-' || lpad(v_po.po_number::text, greatest(4, length(v_po.po_number::text)), '0');
    if v_po.status <> 'draft' then
      raise exception 'Only a draft purchase order can be edited. % is %',
        v_label, replace(v_po.status::text, '_', ' ');
    end if;
  end if;

  v_norm     := public.po_normalize_lines(p_business_id, p_items);
  v_subtotal := (v_norm->>'subtotal')::numeric;
  v_status   := (case when v_place then 'ordered' else 'draft' end)::public.po_status;

  if p_purchase_order_id is null then
    v_number := public.next_document_number(p_business_id, 'purchase_order');
    insert into public.purchase_orders (
      business_id, po_number, supplier_id, status, expected_date, ordered_at,
      subtotal, shipping_cost, total, notes)
    values (
      p_business_id, v_number, p_supplier_id, v_status, p_expected_date,
      case when v_place then now() end,
      v_subtotal, v_ship, v_subtotal + v_ship, v_notes)
    returning id into v_id;
  else
    v_id     := v_po.id;
    v_number := v_po.po_number;
    update public.purchase_orders
       set supplier_id   = p_supplier_id,
           status        = v_status,
           expected_date = p_expected_date,
           ordered_at    = case when v_place then now() end,
           subtotal      = v_subtotal,
           shipping_cost = v_ship,
           total         = v_subtotal + v_ship,
           notes         = v_notes
     where id = v_id and business_id = p_business_id;
    -- a draft has no stock, receipts or history, so its lines are simply replaced
    delete from public.purchase_order_items
     where purchase_order_id = v_id and business_id = p_business_id;
  end if;

  insert into public.purchase_order_items (
    business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
  select p_business_id, v_id, l.product_id, l.quantity, l.unit_cost
    from jsonb_to_recordset(v_norm->'lines') as l(
           product_id uuid, quantity numeric, unit_cost numeric);

  return jsonb_build_object(
    'purchase_order_id', v_id,
    'po_number',         v_number,
    'po_label',          'PO-' || lpad(v_number::text, greatest(4, length(v_number::text)), '0'),
    'status',            v_status,
    'subtotal',          v_subtotal,
    'shipping_cost',     v_ship,
    'total',             v_subtotal + v_ship);
end;
$fn$;

-- Draft -> ordered
create function public.place_purchase_order(p_business_id uuid, p_purchase_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_po    record;
  v_label text;
  v_bad   text;
begin
  if not public.has_permission(p_business_id, 'purchases.manage') then
    raise exception 'You do not have permission to manage purchase orders' using errcode = '42501';
  end if;

  select po.id, po.po_number, po.status, s.name as supplier_name, s.is_active as supplier_active
    into v_po
    from public.purchase_orders po
    join public.suppliers s on s.business_id = po.business_id and s.id = po.supplier_id
   where po.id = p_purchase_order_id and po.business_id = p_business_id
     for update of po;
  if not found then raise exception 'Purchase order not found in this business'; end if;

  v_label := 'PO-' || lpad(v_po.po_number::text, greatest(4, length(v_po.po_number::text)), '0');
  if v_po.status <> 'draft' then
    raise exception 'Only a draft purchase order can be placed. % is %',
      v_label, replace(v_po.status::text, '_', ' ');
  end if;
  if not v_po.supplier_active then
    raise exception '"%" is inactive. Reactivate the supplier first', v_po.supplier_name;
  end if;

  select p.name into v_bad
    from public.purchase_order_items pi
    join public.products p on p.business_id = pi.business_id and p.id = pi.product_id
   where pi.business_id = p_business_id
     and pi.purchase_order_id = p_purchase_order_id
     and (not p.is_active or p.deleted_at is not null)
   limit 1;
  if v_bad is not null then
    raise exception '"%" is inactive or deleted. Reactivate it or edit the order first', v_bad;
  end if;

  update public.purchase_orders
     set status = 'ordered', ordered_at = now()
   where id = p_purchase_order_id and business_id = p_business_id;

  return jsonb_build_object(
    'purchase_order_id', p_purchase_order_id,
    'po_label',          v_label,
    'status',            'ordered');
end;
$fn$;

-- Receive stock (full or partial) against an ordered / partially received order.
-- p_lines: [{ item_id, quantity, unit_cost? }]; unit_cost defaults to the ordered cost.
create function public.receive_purchase_order(
  p_business_id       uuid,
  p_purchase_order_id uuid,
  p_lines             jsonb,
  p_reference         text    default null,
  p_note              text    default null,
  p_update_cost       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ref        text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_po         record;
  v_label      text;
  v_elem       jsonb;
  v_iid        uuid;
  v_qty        numeric;
  v_cost       numeric;
  v_ids        uuid[] := '{}';
  v_item       record;
  v_remaining  numeric;
  v_rows       jsonb := '[]'::jsonb;
  v_total      numeric := 0;
  v_receipt_id uuid;
  v_ln         record;
  v_open       integer;
  v_status     public.po_status;
  v_updated    integer := 0;
begin
  if not public.has_permission(p_business_id, 'purchases.manage') then
    raise exception 'You do not have permission to manage purchase orders' using errcode = '42501';
  end if;

  if v_ref is not null and char_length(v_ref) > 100 then
    raise exception 'The delivery reference can be at most 100 characters';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'The note can be at most 500 characters';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Enter the quantity received for at least one product';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'A delivery can have at most 200 lines';
  end if;

  -- the order row is locked first, so two deliveries on one order cannot interleave
  select po.id, po.po_number, po.status into v_po
    from public.purchase_orders po
   where po.id = p_purchase_order_id and po.business_id = p_business_id
     for update;
  if not found then raise exception 'Purchase order not found in this business'; end if;

  v_label := 'PO-' || lpad(v_po.po_number::text, greatest(4, length(v_po.po_number::text)), '0');
  if v_po.status = 'draft' then
    raise exception '% is still a draft. Place the order before receiving stock', v_label;
  end if;
  if v_po.status = 'received' then
    raise exception '% has already been fully received', v_label;
  end if;
  if v_po.status = 'cancelled' then
    raise exception '% is cancelled', v_label;
  end if;

  -- shape of every line
  for v_elem in select e.value from jsonb_array_elements(p_lines) e loop
    begin
      v_iid := (v_elem->>'item_id')::uuid;
      v_qty := (v_elem->>'quantity')::numeric;
    exception when others then
      raise exception 'Each line needs a valid item and quantity';
    end;
    if v_iid is null or v_qty is null then
      raise exception 'Each line needs a valid item and quantity';
    end if;
    if v_qty >= 1000000000 then raise exception 'A quantity is too large'; end if;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'Quantity can have at most 3 decimal places';
    end if;
    if v_iid = any (v_ids) then
      raise exception 'The same line appears twice. Combine it into one';
    end if;
    v_ids := v_ids || v_iid;
  end loop;

  -- check every line against the order
  for v_elem in select e.value from jsonb_array_elements(p_lines) e loop
    v_iid := (v_elem->>'item_id')::uuid;
    v_qty := (v_elem->>'quantity')::numeric;
    begin
      v_cost := nullif(v_elem->>'unit_cost', '')::numeric;
    exception when others then
      raise exception 'A unit cost is not a valid number';
    end;

    select pi.id, pi.product_id, pi.quantity_ordered, pi.quantity_received, pi.unit_cost,
           p.name, p.is_active, p.deleted_at
      into v_item
      from public.purchase_order_items pi
      join public.products p on p.business_id = pi.business_id and p.id = pi.product_id
     where pi.id = v_iid
       and pi.purchase_order_id = p_purchase_order_id
       and pi.business_id = p_business_id
       for update of pi;
    if not found then
      raise exception 'One of the lines is not part of this purchase order';
    end if;

    v_remaining := v_item.quantity_ordered - v_item.quantity_received;
    if v_qty > v_remaining then
      raise exception 'Only % of "%" is still expected', trim_scale(v_remaining), v_item.name;
    end if;
    if not v_item.is_active or v_item.deleted_at is not null then
      raise exception '"%" is inactive or deleted. Reactivate it before receiving stock', v_item.name;
    end if;

    v_cost := coalesce(v_cost, v_item.unit_cost);
    if v_cost < 0 then raise exception 'A unit cost cannot be negative'; end if;
    if v_cost >= 1000000000 then raise exception 'A unit cost is too large'; end if;
    if v_cost <> round(v_cost, 2) then
      raise exception 'Unit costs can have at most 2 decimal places';
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'item_id',    v_item.id,
      'product_id', v_item.product_id,
      'quantity',   v_qty,
      'unit_cost',  v_cost));
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;

  -- the delivery record
  insert into public.purchase_receipts (business_id, purchase_order_id, reference, note)
  values (p_business_id, p_purchase_order_id, v_ref, v_note)
  returning id into v_receipt_id;

  insert into public.purchase_receipt_items (
    business_id, purchase_receipt_id, purchase_order_item_id, product_id, quantity, unit_cost)
  select p_business_id, v_receipt_id, r.item_id, r.product_id, r.quantity, r.unit_cost
    from jsonb_to_recordset(v_rows) as r(
           item_id uuid, product_id uuid, quantity numeric, unit_cost numeric);

  update public.purchase_order_items pi
     set quantity_received = pi.quantity_received + r.quantity
    from jsonb_to_recordset(v_rows) as r(item_id uuid, quantity numeric)
   where pi.id = r.item_id and pi.business_id = p_business_id;

  -- stock in, in product-id order, through the guarded helper
  for v_ln in
    select r.product_id, r.quantity, r.unit_cost
      from jsonb_to_recordset(v_rows) as r(product_id uuid, quantity numeric, unit_cost numeric)
     order by r.product_id
  loop
    perform public.apply_stock_change(
      p_business_id, v_ln.product_id, 'purchase',
      v_ln.quantity, v_ln.unit_cost,
      'Received on ' || v_label || case when v_ref is not null then ' (' || v_ref || ')' else '' end,
      'purchase_receipt', v_receipt_id);
  end loop;

  -- optional: the received cost becomes the product's cost price ("last cost")
  if coalesce(p_update_cost, false) then
    update public.products p
       set cost_price = r.unit_cost
      from jsonb_to_recordset(v_rows) as r(product_id uuid, unit_cost numeric)
     where p.id = r.product_id
       and p.business_id = p_business_id
       and p.cost_price is distinct from r.unit_cost;
    get diagnostics v_updated = row_count;
  end if;

  select count(*) into v_open
    from public.purchase_order_items pi
   where pi.business_id = p_business_id
     and pi.purchase_order_id = p_purchase_order_id
     and pi.quantity_received < pi.quantity_ordered;

  v_status := (case when v_open = 0 then 'received' else 'partially_received' end)::public.po_status;

  update public.purchase_orders
     set status      = v_status,
         received_at = case when v_open = 0 then now() else received_at end
   where id = p_purchase_order_id and business_id = p_business_id;

  return jsonb_build_object(
    'receipt_id',       v_receipt_id,
    'po_label',         v_label,
    'status',           v_status,
    'fully_received',   v_open = 0,
    'lines_received',   jsonb_array_length(v_rows),
    'receipt_total',    v_total,
    'costs_updated',    v_updated);
end;
$fn$;

-- Cancel anything that is not fully received. Stock already received stays.
create function public.cancel_purchase_order(
  p_business_id       uuid,
  p_purchase_order_id uuid,
  p_reason            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_po       record;
  v_label    text;
  v_received numeric;
begin
  if not public.has_permission(p_business_id, 'purchases.manage') then
    raise exception 'You do not have permission to manage purchase orders' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Give a reason for cancelling this purchase order';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason can be at most 500 characters';
  end if;

  select po.id, po.po_number, po.status into v_po
    from public.purchase_orders po
   where po.id = p_purchase_order_id and po.business_id = p_business_id
     for update;
  if not found then raise exception 'Purchase order not found in this business'; end if;

  v_label := 'PO-' || lpad(v_po.po_number::text, greatest(4, length(v_po.po_number::text)), '0');
  if v_po.status = 'cancelled' then
    raise exception '% is already cancelled', v_label;
  end if;
  if v_po.status = 'received' then
    raise exception '% has been fully received and cannot be cancelled. If stock was received by mistake, correct it with a stock adjustment', v_label;
  end if;

  select coalesce(sum(pi.quantity_received), 0) into v_received
    from public.purchase_order_items pi
   where pi.business_id = p_business_id and pi.purchase_order_id = p_purchase_order_id;

  update public.purchase_orders
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = v_reason
   where id = p_purchase_order_id and business_id = p_business_id;

  return jsonb_build_object(
    'purchase_order_id', p_purchase_order_id,
    'po_label',          v_label,
    'quantity_received', v_received,
    'had_received_stock', v_received > 0);
end;
$fn$;

-- Grants: internal helper closed to everyone; the four actions open to signed-in users
revoke all on function public.po_normalize_lines(uuid, jsonb) from public, anon, authenticated;

revoke all on function public.save_purchase_order(uuid, uuid, uuid, jsonb, date, numeric, text, boolean)
  from public, anon, authenticated;
revoke all on function public.place_purchase_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.receive_purchase_order(uuid, uuid, jsonb, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.cancel_purchase_order(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.save_purchase_order(uuid, uuid, uuid, jsonb, date, numeric, text, boolean) to authenticated;
grant execute on function public.place_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, uuid, jsonb, text, text, boolean) to authenticated;
grant execute on function public.cancel_purchase_order(uuid, uuid, text) to authenticated;