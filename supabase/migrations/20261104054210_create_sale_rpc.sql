-- 1) refresh_customer_stats (internal)
--    Recomputes the customer's purchase stats from the source rows.
--    total_spent = completed sales totals minus refunds on those sales.
create or replace function public.refresh_customer_stats(
  p_business_id uuid,
  p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_customer_id is null then
    return;
  end if;

  update public.customers c
     set total_orders = (
           select count(*)::integer
             from public.sales s
            where s.business_id = c.business_id
              and s.customer_id = c.id
              and s.status = 'completed'),
         total_spent = coalesce((
           select sum(s.total)
             from public.sales s
            where s.business_id = c.business_id
              and s.customer_id = c.id
              and s.status = 'completed'), 0)
           - coalesce((
           select sum(r.refund_total)
             from public.sale_returns r
             join public.sales s
               on s.business_id = r.business_id and s.id = r.sale_id
            where r.business_id = c.business_id
              and s.customer_id = c.id
              and s.status = 'completed'), 0),
         last_purchase_at = (
           select max(s.sold_at)
             from public.sales s
            where s.business_id = c.business_id
              and s.customer_id = c.id
              and s.status = 'completed')
   where c.id = p_customer_id
     and c.business_id = p_business_id;
end;
$$;

revoke all on function public.refresh_customer_stats(uuid, uuid)
  from public, anon, authenticated;


-- 2) compute_sale_pricing (internal)
--    Validates the items, prices them from the products table, chooses the
--    discount and spreads it over the lines. Returns everything as jsonb.

create or replace function public.compute_sale_pricing(
  p_business_id uuid,
  p_customer_id uuid,
  p_items       jsonb,
  p_promo_code  text default null,
  p_manual_type public.discount_type default null,
  p_manual_value numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_elem       jsonb;
  v_pid        uuid;
  v_qty        numeric;
  v_seen       uuid[] := '{}';
  v_count      integer;
  v_bad        text;
  v_cust       record;
  v_cust_pct   numeric := 0;
  v_cust_amt   numeric := 0;
  v_base       jsonb;
  v_subtotal   numeric;
  v_cost_total numeric;
  v_code       text := nullif(btrim(coalesce(p_promo_code, '')), '');
  v_promo      record;
  v_promo_amt  numeric := 0;
  v_promo_ok   boolean := false;
  v_promo_error text;
  v_promo_note  text;
  v_discount   numeric := 0;
  v_discount_id uuid;
  v_source     text := 'none';
  v_lines      jsonb;
begin
  -- ---- A) the item list ----
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product to the sale';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A sale can have at most 200 different products';
  end if;

  for v_elem in select e.value from jsonb_array_elements(p_items) e loop
    begin
      v_pid := (v_elem->>'product_id')::uuid;
      v_qty := (v_elem->>'quantity')::numeric;
    exception when others then
      raise exception 'Each item needs a valid product_id and quantity';
    end;
    if v_pid is null or v_qty is null then
      raise exception 'Each item needs a valid product_id and quantity';
    end if;
    if v_qty >= 1000000000 then
      raise exception 'A quantity is too large';
    end if;
    if v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'Quantity can have at most 3 decimal places';
    end if;
    if v_pid = any (v_seen) then
      raise exception 'The same product appears twice. Combine it into one line';
    end if;
    v_seen := v_seen || v_pid;
  end loop;

  -- ---- B) the products ----
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
    raise exception '"%" is inactive or deleted and cannot be sold', v_bad;
  end if;

  -- ---- C) the customer ----
  if p_customer_id is not null then
    select c.name, c.is_active, c.discount_percent
      into v_cust
      from public.customers c
     where c.id = p_customer_id and c.business_id = p_business_id;
    if not found then
      raise exception 'Customer not found in this business';
    end if;
    if not v_cust.is_active then
      raise exception '"%" is inactive. Reactivate the customer before selling to them', v_cust.name;
    end if;
    v_cust_pct := v_cust.discount_percent;
  end if;

  -- ---- D) manual discount rules ----
  if p_manual_type is not null or p_manual_value is not null then
    if p_manual_type is null or p_manual_value is null then
      raise exception 'A manual discount needs both a type and a value';
    end if;
    if p_manual_value <= 0 then
      raise exception 'The manual discount must be greater than zero';
    end if;
    if p_manual_value <> round(p_manual_value, 2) then
      raise exception 'The manual discount can have at most 2 decimal places';
    end if;
    if p_manual_type = 'percent' and p_manual_value > 100 then
      raise exception 'A percentage discount cannot be more than 100';
    end if;
    if v_code is not null then
      raise exception 'Use either a promo code or a manual discount, not both';
    end if;
    if not public.has_permission(p_business_id, 'discounts.manage') then
      raise exception 'You do not have permission to give a manual discount';
    end if;
  end if;

  -- ---- E) price every line from the products table ----
  select jsonb_agg(
           jsonb_build_object(
             'ord',          t.ord,
             'product_id',   p.id,
             'product_name', p.name,
             'product_sku',  p.sku,
             'unit',         p.unit,
             'quantity',     t.qty,
             'unit_price',   p.selling_price,
             'unit_cost',    p.cost_price,
             'gross',        round(t.qty * p.selling_price, 2),
             'cost',         round(t.qty * p.cost_price, 2),
             'on_hand',      p.quantity_on_hand)
           order by t.ord)
    into v_base
    from (select x.ord,
                 (x.e->>'product_id')::uuid as pid,
                 (x.e->>'quantity')::numeric as qty
            from jsonb_array_elements(p_items) with ordinality as x(e, ord)) t
    join public.products p
      on p.id = t.pid and p.business_id = p_business_id;

  select coalesce(sum(b.gross), 0), coalesce(sum(b.cost), 0)
    into v_subtotal, v_cost_total
    from jsonb_to_recordset(v_base) as b(gross numeric, cost numeric);

  v_cust_amt := round(v_subtotal * v_cust_pct / 100, 2);

  -- ---- F) promo code (invalid codes are reported, not raised) ----
  if v_code is not null then
    select d.id, d.name, d.discount_type, d.value, d.min_order_amount,
           d.starts_at, d.ends_at, d.usage_limit, d.times_used, d.is_active
      into v_promo
      from public.discounts d
     where d.business_id = p_business_id
       and lower(d.code) = lower(v_code);

    if not found then
      v_promo_error := 'Promo code not found';
    elsif not v_promo.is_active then
      v_promo_error := 'This promo code is turned off';
    elsif v_promo.starts_at is not null and v_promo.starts_at > now() then
      v_promo_error := 'This promo code has not started yet';
    elsif v_promo.ends_at is not null and v_promo.ends_at <= now() then
      v_promo_error := 'This promo code has expired';
    elsif v_promo.usage_limit is not null and v_promo.times_used >= v_promo.usage_limit then
      v_promo_error := 'This promo code has reached its usage limit';
    elsif v_subtotal < v_promo.min_order_amount then
      v_promo_error := format('This promo code needs an order of at least %s', v_promo.min_order_amount);
    else
      v_promo_ok := true;
      if v_promo.discount_type = 'percent' then
        v_promo_amt := round(v_subtotal * v_promo.value / 100, 2);
      else
        v_promo_amt := least(v_promo.value, v_subtotal);
      end if;
    end if;
  end if;

  -- ---- G) choose the discount (never stacked) ----
  if p_manual_type is not null then
    v_source := 'manual';
    if p_manual_type = 'percent' then
      v_discount := round(v_subtotal * p_manual_value / 100, 2);
    else
      v_discount := least(p_manual_value, v_subtotal);
    end if;
  elsif v_promo_ok and v_promo_amt > v_cust_amt then
    v_source := 'promo';
    v_discount := v_promo_amt;
    v_discount_id := v_promo.id;
  else
    if v_promo_ok then
      v_promo_note := 'The customer''s discount is as large or larger, so the promo code was not applied';
    end if;
    if v_cust_amt > 0 then
      v_source := 'customer';
      v_discount := v_cust_amt;
    end if;
  end if;

  -- ---- H) spread the discount over the lines ----
  -- Each line gets its proportional share (rounded); the largest line absorbs
  -- the rounding remainder so the shares add up exactly.
  select jsonb_agg(
           jsonb_build_object(
             'product_id',       f.product_id,
             'product_name',     f.product_name,
             'product_sku',      f.product_sku,
             'unit',             f.unit,
             'quantity',         f.quantity,
             'unit_price',       f.unit_price,
             'unit_cost',        f.unit_cost,
             'gross',            f.gross,
             'discount_amount',  f.disc,
             'line_total',       f.gross - f.disc,
             'quantity_on_hand', f.on_hand,
             'stock_ok',         f.on_hand >= f.quantity)
           order by f.ord)
    into v_lines
    from (
      select a.*,
             case when a.rn = 1
                  then v_discount - (sum(a.share0) over () - a.share0)
                  else a.share0
             end as disc
        from (
          select b.*,
                 coalesce(round(v_discount * b.gross / nullif(v_subtotal, 0), 2), 0) as share0,
                 row_number() over (order by b.gross desc, b.ord) as rn
            from jsonb_to_recordset(v_base) as b(
                   ord bigint, product_id uuid, product_name text, product_sku text,
                   unit text, quantity numeric, unit_price numeric, unit_cost numeric,
                   gross numeric, cost numeric, on_hand numeric)
        ) a
    ) f;

  return jsonb_build_object(
    'subtotal',                  v_subtotal,
    'discount_total',            v_discount,
    'tax_total',                 0,
    'total',                     v_subtotal - v_discount,
    'cost_total',                v_cost_total,
    'discount_id',               v_discount_id,
    'discount_source',           v_source,
    'customer_discount_percent', v_cust_pct,
    'customer_discount_amount',  v_cust_amt,
    'promo_discount_amount',     case when v_promo_ok then v_promo_amt else 0 end,
    'promo_error',               v_promo_error,
    'promo_note',                v_promo_note,
    'lines',                     v_lines);
end;
$$;

revoke all on function public.compute_sale_pricing(uuid, uuid, jsonb, text, public.discount_type, numeric)
  from public, anon, authenticated;


-- 3) quote_sale: live preview for the New Sale screen. Saves nothing.

create or replace function public.quote_sale(
  p_business_id uuid,
  p_customer_id uuid,
  p_items       jsonb,
  p_promo_code  text default null,
  p_manual_discount_type  public.discount_type default null,
  p_manual_discount_value numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p_business_id, 'sales.create') then
    raise exception 'You do not have permission to create sales' using errcode = '42501';
  end if;

  return public.compute_sale_pricing(
    p_business_id, p_customer_id, p_items, p_promo_code,
    p_manual_discount_type, p_manual_discount_value);
end;
$$;

revoke all on function public.quote_sale(uuid, uuid, jsonb, text, public.discount_type, numeric)
  from public, anon, authenticated;
grant execute on function public.quote_sale(uuid, uuid, jsonb, text, public.discount_type, numeric)
  to authenticated;


-- 4) create_sale: the atomic sale

create or replace function public.create_sale(
  p_business_id uuid,
  p_customer_id uuid,
  p_items       jsonb,
  p_payments    jsonb default '[]'::jsonb,
  p_promo_code  text default null,
  p_manual_discount_type  public.discount_type default null,
  p_manual_discount_value numeric default null,
  p_notes       text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code         text := nullif(btrim(coalesce(p_promo_code, '')), '');
  v_notes        text := nullif(btrim(coalesce(p_notes, '')), '');
  v_payments     jsonb := coalesce(p_payments, '[]'::jsonb);
  v_pricing      jsonb;
  v_total        numeric;
  v_elem         jsonb;
  v_method       public.payment_method;
  v_amt          numeric;
  v_ref          text;
  v_pay_rows     jsonb := '[]'::jsonb;
  v_paid         numeric := 0;
  v_remainder    numeric;
  v_pay_method   public.payment_method;
  v_number       integer;
  v_label        text;
  v_sale_id      uuid;
  v_discount_id  uuid;
  v_line         record;
begin
  if not public.has_permission(p_business_id, 'sales.create') then
    raise exception 'You do not have permission to create sales' using errcode = '42501';
  end if;

  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'Notes can be at most 500 characters';
  end if;

  -- ---- locks (always in the same order: customer, promo, products by id) ----
  if p_customer_id is not null then
    perform 1 from public.customers c
     where c.id = p_customer_id and c.business_id = p_business_id
       for update;
  end if;

  if v_code is not null then
    perform 1 from public.discounts d
     where d.business_id = p_business_id and lower(d.code) = lower(v_code)
       for update;
  end if;

  begin
    perform 1 from public.products p
     where p.business_id = p_business_id
       and p.id in (select (e.value->>'product_id')::uuid
                      from jsonb_array_elements(p_items) e)
     order by p.id
       for update;
  exception when invalid_text_representation or invalid_parameter_value then
    null;  -- a badly shaped item list gets a friendly message from the pricing step
  end;

  -- ---- price everything on the server ----
  v_pricing := public.compute_sale_pricing(
    p_business_id, p_customer_id, p_items, v_code,
    p_manual_discount_type, p_manual_discount_value);

  if v_pricing->>'promo_error' is not null then
    raise exception '%', v_pricing->>'promo_error';
  end if;
  v_total := (v_pricing->>'total')::numeric;

  -- ---- friendly stock message (apply_stock_change below is the real guard) ----
  for v_line in
    select l.product_name, l.quantity, l.quantity_on_hand
      from jsonb_to_recordset(v_pricing->'lines') as l(
             product_name text, quantity numeric, quantity_on_hand numeric, stock_ok boolean)
     where not l.stock_ok
     limit 1
  loop
    raise exception 'Not enough stock for "%": % available, % requested',
      v_line.product_name, v_line.quantity_on_hand, v_line.quantity;
  end loop;

  -- ---- validate the payments ----
  if jsonb_typeof(v_payments) <> 'array' then
    raise exception 'Payments must be a list';
  end if;
  if jsonb_array_length(v_payments) > 10 then
    raise exception 'A sale can have at most 10 payments';
  end if;

  for v_elem in select e.value from jsonb_array_elements(v_payments) e loop
    begin
      v_method := (v_elem->>'method')::public.payment_method;
      v_amt    := (v_elem->>'amount')::numeric;
    exception when others then
      raise exception 'Each payment needs a valid method and amount';
    end;
    if v_method is null or v_amt is null then
      raise exception 'Each payment needs a valid method and amount';
    end if;
    if v_amt >= 1000000000000 then
      raise exception 'A payment amount is too large';
    end if;
    if v_amt <= 0 then
      raise exception 'Each payment amount must be greater than zero';
    end if;
    if v_amt <> round(v_amt, 2) then
      raise exception 'Payment amounts can have at most 2 decimal places';
    end if;
    v_ref := nullif(btrim(coalesce(v_elem->>'reference', '')), '');
    if v_ref is not null and char_length(v_ref) > 100 then
      raise exception 'A payment reference can be at most 100 characters';
    end if;

    v_pay_rows := v_pay_rows || jsonb_build_array(
      jsonb_build_object('method', v_method::text, 'amount', v_amt, 'reference', v_ref));
    v_paid := v_paid + v_amt;
  end loop;

  if v_paid > v_total then
    raise exception 'Payments (%) are more than the sale total (%)', v_paid, v_total;
  end if;

  v_remainder := v_total - v_paid;
  if v_remainder > 0 and p_customer_id is null then
    raise exception 'Walk-in sales must be paid in full. Choose a customer to put the rest on credit';
  end if;

  -- one method on the sale only when every payment used the same one
  if jsonb_array_length(v_pay_rows) > 0 then
    select case when count(distinct x.method) = 1 then (array_agg(x.method))[1] end
      into v_pay_method
      from jsonb_to_recordset(v_pay_rows) as x(
             method public.payment_method, amount numeric, reference text);
  end if;

  -- ---- document number, then the sale ----
  v_number := public.next_document_number(p_business_id, 'sale');
  v_label  := 'S-' || lpad(v_number::text, greatest(4, length(v_number::text)), '0');
  v_discount_id := nullif(v_pricing->>'discount_id', '')::uuid;

  insert into public.sales (
    business_id, sale_number, customer_id, discount_id,
    subtotal, discount_total, tax_total, total, cost_total,
    amount_paid, payment_method, notes)
  values (
    p_business_id, v_number, p_customer_id, v_discount_id,
    (v_pricing->>'subtotal')::numeric,
    (v_pricing->>'discount_total')::numeric,
    0,
    v_total,
    (v_pricing->>'cost_total')::numeric,
    v_paid, v_pay_method, v_notes)
  returning id into v_sale_id;

  -- ---- items (prices and costs are snapshots) ----
  insert into public.sale_items (
    business_id, sale_id, product_id, product_name, product_sku,
    quantity, unit_price, unit_cost, discount_amount)
  select p_business_id, v_sale_id, l.product_id, l.product_name, l.product_sku,
         l.quantity, l.unit_price, l.unit_cost, l.discount_amount
    from jsonb_to_recordset(v_pricing->'lines') as l(
           product_id uuid, product_name text, product_sku text,
           quantity numeric, unit_price numeric, unit_cost numeric, discount_amount numeric);

  -- ---- stock out, in product-id order, through the guarded helper ----
  for v_line in
    select l.product_id, l.quantity, l.unit_cost
      from jsonb_to_recordset(v_pricing->'lines') as l(
             product_id uuid, quantity numeric, unit_cost numeric)
     order by l.product_id
  loop
    perform public.apply_stock_change(
      p_business_id, v_line.product_id, 'sale',
      -v_line.quantity, v_line.unit_cost,
      'Sale ' || v_label, 'sale', v_sale_id);
  end loop;

  -- ---- payments ----
  insert into public.sale_payments (business_id, sale_id, amount, method, reference)
  select p_business_id, v_sale_id, x.amount, x.method, x.reference
    from jsonb_to_recordset(v_pay_rows) as x(
           method public.payment_method, amount numeric, reference text);

  -- ---- the unpaid part goes on the customer's account ----
  if v_remainder > 0 then
    insert into public.customer_transactions (
      business_id, customer_id, txn_type, amount, sale_id, note)
    values (
      p_business_id, p_customer_id, 'credit_sale', v_remainder, v_sale_id,
      'Unpaid part of sale ' || v_label);
  end if;

  -- ---- promo usage, customer stats ----
  if v_discount_id is not null then
    update public.discounts
       set times_used = times_used + 1
     where id = v_discount_id and business_id = p_business_id;
  end if;

  perform public.refresh_customer_stats(p_business_id, p_customer_id);

  return jsonb_build_object(
    'sale_id',         v_sale_id,
    'sale_number',     v_number,
    'sale_label',      v_label,
    'total',           v_total,
    'discount_total',  (v_pricing->>'discount_total')::numeric,
    'amount_paid',     v_paid,
    'amount_on_credit', v_remainder);
end;
$$;

revoke all on function public.create_sale(
  uuid, uuid, jsonb, jsonb, text, public.discount_type, numeric, text)
  from public, anon, authenticated;
grant execute on function public.create_sale(
  uuid, uuid, jsonb, jsonb, text, public.discount_type, numeric, text)
  to authenticated;