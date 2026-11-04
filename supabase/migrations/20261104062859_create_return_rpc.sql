-- Step 8, migration 5 of 5: create_return_rpc

create or replace function public.create_return(
  p_business_id   uuid,
  p_sale_id       uuid,
  p_items         jsonb,
  p_refund_method public.refund_method default null,
  p_reason        text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason        text := nullif(btrim(coalesce(p_reason, '')), '');
  v_sale          record;
  v_sale_label    text;
  v_elem          jsonb;
  v_sid           uuid;
  v_qty           numeric;
  v_cond          public.return_condition;
  v_ids           uuid[] := '{}';
  v_item          record;
  v_lines         jsonb := '[]'::jsonb;
  v_remaining     numeric;
  v_unit          numeric;
  v_line          numeric;
  v_prev          numeric;
  v_restock       boolean;
  v_refund_total  numeric := 0;
  v_outstanding   numeric := 0;
  v_offset        numeric := 0;
  v_paid_out      numeric;
  v_method        public.refund_method;
  v_number        integer;
  v_label         text;
  v_return_id     uuid;
  v_restocked     integer := 0;
  v_not_restocked jsonb := '[]'::jsonb;
  v_ln            record;
begin
  -- ---- who may do this, and the basic shape ----
  if not public.has_permission(p_business_id, 'sales.return') then
    raise exception 'You do not have permission to process returns' using errcode = '42501';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'The reason can be at most 500 characters';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item to return';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A return can have at most 200 items';
  end if;

  -- ---- lock the sale, then check it can take returns ----
  select s.id, s.sale_number, s.status, s.customer_id, s.balance_due
    into v_sale
    from public.sales s
   where s.id = p_sale_id and s.business_id = p_business_id
     for update;

  if not found then
    raise exception 'Sale not found in this business';
  end if;

  v_sale_label := 'S-' || lpad(v_sale.sale_number::text, greatest(4, length(v_sale.sale_number::text)), '0');

  if v_sale.status <> 'completed' then
    raise exception 'Sale % is voided and cannot be returned', v_sale_label;
  end if;

  -- ---- validate the shape of every item ----
  for v_elem in select e.value from jsonb_array_elements(p_items) e loop
    begin
      v_sid := (v_elem->>'sale_item_id')::uuid;
      v_qty := (v_elem->>'quantity')::numeric;
    exception when others then
      raise exception 'Each item needs a valid sale_item_id and quantity';
    end;
    if v_sid is null or v_qty is null then
      raise exception 'Each item needs a valid sale_item_id and quantity';
    end if;

    begin
      v_cond := coalesce(nullif(v_elem->>'condition', ''), 'resellable')::public.return_condition;
    exception when others then
      raise exception 'Condition must be resellable or damaged';
    end;

    if v_qty >= 1000000000 then
      raise exception 'A quantity is too large';
    end if;
    if v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'Quantity can have at most 3 decimal places';
    end if;
    if v_sid = any (v_ids) then
      raise exception 'The same item appears twice. Combine it into one line';
    end if;
    v_ids := v_ids || v_sid;
  end loop;

  -- ---- remaining locks: customer, then the products in id order ----
  if v_sale.customer_id is not null then
    perform 1 from public.customers c
     where c.id = v_sale.customer_id and c.business_id = p_business_id
       for update;
  end if;

  perform 1 from public.products p
   where p.business_id = p_business_id
     and p.id in (select si.product_id
                    from public.sale_items si
                   where si.business_id = p_business_id
                     and si.sale_id = p_sale_id
                     and si.id = any (v_ids))
   order by p.id
     for update;

  -- ---- price every returned line ----
  for v_elem in select e.value from jsonb_array_elements(p_items) e loop
    v_sid  := (v_elem->>'sale_item_id')::uuid;
    v_qty  := (v_elem->>'quantity')::numeric;
    v_cond := coalesce(nullif(v_elem->>'condition', ''), 'resellable')::public.return_condition;

    select si.id, si.product_id, si.product_name, si.quantity, si.returned_quantity,
           si.unit_cost, si.line_total, p.is_active, p.deleted_at
      into v_item
      from public.sale_items si
      join public.products p
        on p.business_id = si.business_id and p.id = si.product_id
     where si.id = v_sid
       and si.sale_id = p_sale_id
       and si.business_id = p_business_id;

    if not found then
      raise exception 'One of the items is not part of this sale';
    end if;

    v_remaining := v_item.quantity - v_item.returned_quantity;
    if v_qty > v_remaining then
      raise exception 'Only % of "%" can still be returned', v_remaining, v_item.product_name;
    end if;

    -- net price per unit, rounded DOWN to the kobo so we never refund more than was charged
    v_unit := floor(v_item.line_total / v_item.quantity * 100) / 100;
    v_line := round(v_qty * v_unit, 2);

    select coalesce(sum(r.line_total), 0)
      into v_prev
      from public.sale_return_items r
     where r.business_id = p_business_id and r.sale_item_id = v_item.id;

    if v_prev + v_line > v_item.line_total then
      raise exception 'The refund for "%" would be more than was charged. Contact support', v_item.product_name;
    end if;

    v_restock := v_cond = 'resellable'
                 and v_item.is_active
                 and v_item.deleted_at is null;

    v_refund_total := v_refund_total + v_line;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'sale_item_id',       v_item.id,
      'product_id',         v_item.product_id,
      'product_name',       v_item.product_name,
      'quantity',           v_qty,
      'unit_cost',          v_item.unit_cost,
      'refund_unit_amount', v_unit,
      'condition',          v_cond::text,
      'restock',            v_restock));
  end loop;

  -- ---- split the refund: debt first, then pay-out ----
  if v_sale.customer_id is not null then
    select greatest(v_sale.balance_due - coalesce(sum(r.debt_offset), 0), 0)
      into v_outstanding
      from public.sale_returns r
     where r.business_id = p_business_id and r.sale_id = p_sale_id;
    v_offset := least(v_refund_total, v_outstanding);
  end if;

  v_paid_out := v_refund_total - v_offset;

  if v_paid_out > 0 then
    if p_refund_method is null then
      raise exception 'Choose how the refund is paid (%)', v_paid_out;
    end if;
    if p_refund_method = 'store_credit' and v_sale.customer_id is null then
      raise exception 'Store credit needs a customer on the sale. Choose another refund method';
    end if;
    v_method := p_refund_method;
  else
    v_method := null;
  end if;

  -- ---- the return itself ----
  v_number := public.next_document_number(p_business_id, 'return');
  v_label  := 'R-' || lpad(v_number::text, greatest(4, length(v_number::text)), '0');

  insert into public.sale_returns (
    business_id, return_number, sale_id, customer_id,
    refund_total, debt_offset, refund_method, reason)
  values (
    p_business_id, v_number, p_sale_id, v_sale.customer_id,
    v_refund_total, v_offset, v_method, v_reason)
  returning id into v_return_id;

  insert into public.sale_return_items (
    business_id, sale_return_id, sale_item_id, product_id,
    quantity, refund_unit_amount, condition, restocked)
  select p_business_id, v_return_id, l.sale_item_id, l.product_id,
         l.quantity, l.refund_unit_amount, l.condition, l.restock
    from jsonb_to_recordset(v_lines) as l(
           sale_item_id uuid, product_id uuid, quantity numeric,
           refund_unit_amount numeric, condition public.return_condition,
           restock boolean);

  update public.sale_items si
     set returned_quantity = si.returned_quantity + l.quantity
    from jsonb_to_recordset(v_lines) as l(sale_item_id uuid, quantity numeric)
   where si.id = l.sale_item_id and si.business_id = p_business_id;

  -- ---- stock back on the shelf, in product-id order ----
  for v_ln in
    select l.product_id, l.quantity, l.unit_cost
      from jsonb_to_recordset(v_lines) as l(
             product_id uuid, quantity numeric, unit_cost numeric, restock boolean)
     where l.restock
     order by l.product_id
  loop
    perform public.apply_stock_change(
      p_business_id, v_ln.product_id, 'sale_return',
      v_ln.quantity, v_ln.unit_cost,
      'Return ' || v_label || ' (sale ' || v_sale_label || ')',
      'sale_return', v_return_id);
    v_restocked := v_restocked + 1;
  end loop;

  -- ---- tell the caller what was not restocked, and why ----
  for v_ln in
    select l.product_name, l.condition
      from jsonb_to_recordset(v_lines) as l(
             product_name text, condition text, restock boolean)
     where not l.restock
  loop
    v_not_restocked := v_not_restocked || jsonb_build_array(jsonb_build_object(
      'product_name', v_ln.product_name,
      'reason', case when v_ln.condition = 'damaged'
                     then 'damaged'
                     else 'product inactive or deleted' end));
  end loop;

  -- ---- customer ledger ----
  if v_offset > 0 then
    insert into public.customer_transactions (
      business_id, customer_id, txn_type, amount, sale_id, sale_return_id, note)
    values (
      p_business_id, v_sale.customer_id, 'return_credit', -v_offset,
      p_sale_id, v_return_id,
      'Return ' || v_label || ' cancelled debt on sale ' || v_sale_label);
  end if;

  if v_method = 'store_credit' then
    insert into public.customer_transactions (
      business_id, customer_id, txn_type, amount, sale_id, sale_return_id, note)
    values (
      p_business_id, v_sale.customer_id, 'return_credit', -v_paid_out,
      p_sale_id, v_return_id,
      'Store credit for return ' || v_label);
  end if;

  perform public.refresh_customer_stats(p_business_id, v_sale.customer_id);

  return jsonb_build_object(
    'return_id',            v_return_id,
    'return_number',        v_number,
    'return_label',         v_label,
    'sale_label',           v_sale_label,
    'refund_total',         v_refund_total,
    'debt_offset',          v_offset,
    'refund_paid',          v_paid_out,
    'refund_method',        v_method,
    'store_credit_issued',  case when v_method = 'store_credit' then v_paid_out else 0 end,
    'items_restocked',      v_restocked,
    'not_restocked',        v_not_restocked);
end;
$$;

revoke all on function public.create_return(uuid, uuid, jsonb, public.refund_method, text)
  from public, anon, authenticated;
grant execute on function public.create_return(uuid, uuid, jsonb, public.refund_method, text)
  to authenticated;