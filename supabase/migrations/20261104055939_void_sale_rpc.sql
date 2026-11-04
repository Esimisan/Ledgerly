-- Step 8, migration 4 of 5: void_sale_rpc

create or replace function public.void_sale(
  p_business_id uuid,
  p_sale_id     uuid,
  p_reason      text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_sale      record;
  v_label     text;
  v_credit    numeric := 0;
  v_item      record;
  v_restocked integer := 0;
  v_skipped   jsonb := '[]'::jsonb;
begin
  -- ---- who may do this, and the reason ----
  if not public.has_permission(p_business_id, 'sales.void') then
    raise exception 'You do not have permission to void sales' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Give a reason for voiding this sale';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason can be at most 500 characters';
  end if;

  -- ---- lock the sale, then check it can be voided ----
  select s.id, s.sale_number, s.status, s.customer_id, s.discount_id, s.amount_paid
    into v_sale
    from public.sales s
   where s.id = p_sale_id and s.business_id = p_business_id
     for update;

  if not found then
    raise exception 'Sale not found in this business';
  end if;

  v_label := 'S-' || lpad(v_sale.sale_number::text, greatest(4, length(v_sale.sale_number::text)), '0');

  if v_sale.status = 'voided' then
    raise exception 'Sale % is already voided', v_label;
  end if;

  if exists (select 1 from public.sale_returns r
              where r.business_id = p_business_id and r.sale_id = p_sale_id) then
    raise exception 'Sale % already has returns. Return the remaining items instead of voiding it', v_label;
  end if;

  -- ---- remaining locks: customer, promo (products are locked in the loop below) ----
  if v_sale.customer_id is not null then
    perform 1 from public.customers c
     where c.id = v_sale.customer_id and c.business_id = p_business_id
       for update;
  end if;

  if v_sale.discount_id is not null then
    perform 1 from public.discounts d
     where d.id = v_sale.discount_id and d.business_id = p_business_id
       for update;
  end if;

  -- ---- stock goes back, in product-id order ----
  for v_item in
    select si.product_id, si.product_name, si.quantity, si.unit_cost,
           p.is_active, p.deleted_at
      from public.sale_items si
      join public.products p
        on p.business_id = si.business_id and p.id = si.product_id
     where si.business_id = p_business_id and si.sale_id = p_sale_id
     order by si.product_id
       for update of p
  loop
    if v_item.is_active and v_item.deleted_at is null then
      perform public.apply_stock_change(
        p_business_id, v_item.product_id, 'sale_return',
        v_item.quantity, v_item.unit_cost,
        'Void of sale ' || v_label, 'sale_void', p_sale_id);
      v_restocked := v_restocked + 1;
    else
      v_skipped := v_skipped || jsonb_build_array(v_item.product_name);
    end if;
  end loop;

  -- ---- reverse what the sale put on the customer's account ----
  if v_sale.customer_id is not null then
    select coalesce(sum(t.amount), 0)
      into v_credit
      from public.customer_transactions t
     where t.business_id = p_business_id
       and t.sale_id = p_sale_id
       and t.txn_type = 'credit_sale';

    if v_credit > 0 then
      insert into public.customer_transactions (
        business_id, customer_id, txn_type, amount, sale_id, note)
      values (
        p_business_id, v_sale.customer_id, 'adjustment', -v_credit, p_sale_id,
        'Reversal of voided sale ' || v_label);
    end if;
  end if;

  -- ---- give the promo use back ----
  if v_sale.discount_id is not null then
    update public.discounts
       set times_used = greatest(times_used - 1, 0)
     where id = v_sale.discount_id and business_id = p_business_id;
  end if;

  -- ---- mark the sale voided ----
  update public.sales
     set status      = 'voided',
         voided_at   = now(),
         voided_by   = auth.uid(),
         void_reason = v_reason
   where id = p_sale_id and business_id = p_business_id;

  perform public.refresh_customer_stats(p_business_id, v_sale.customer_id);

  return jsonb_build_object(
    'sale_id',           p_sale_id,
    'sale_label',        v_label,
    'amount_paid',       v_sale.amount_paid,
    'amount_credit_reversed', v_credit,
    'items_restocked',   v_restocked,
    'skipped_products',  v_skipped);
end;
$$;

revoke all on function public.void_sale(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.void_sale(uuid, uuid, text)
  to authenticated;