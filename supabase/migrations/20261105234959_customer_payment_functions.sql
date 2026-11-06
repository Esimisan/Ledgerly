create function public.record_customer_payment(
  p_business_id uuid,
  p_customer_id uuid,
  p_amount      numeric,
  p_method      public.payment_method,
  p_reference   text default null,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ref     text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_cust    record;
  v_before  numeric;
  v_applied numeric;
  v_tx      public.customer_transactions;
begin
  if not public.has_permission(p_business_id, 'customers.write') then
    raise exception 'You do not have permission to record customer payments' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'The payment amount must be greater than zero';
  end if;
  if p_amount >= 1000000000000 then raise exception 'The payment amount is too large'; end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'The payment amount can have at most 2 decimal places';
  end if;
  if p_method is null then raise exception 'Choose how the customer paid'; end if;
  if v_ref is not null and char_length(v_ref) > 100 then
    raise exception 'The reference can be at most 100 characters';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'The note can be at most 500 characters';
  end if;

  select c.id, c.name, c.balance into v_cust
    from public.customers c
   where c.id = p_customer_id and c.business_id = p_business_id
     for update;
  if not found then raise exception 'Customer not found in this business'; end if;

  v_before := v_cust.balance;

  insert into public.customer_transactions (
    business_id, customer_id, txn_type, amount, payment_method, reference, note)
  values (
    p_business_id, p_customer_id, 'payment', -p_amount, p_method, v_ref, v_note)
  returning * into v_tx;

  v_applied := least(p_amount, greatest(v_before, 0));

  return jsonb_build_object(
    'transaction_id',  v_tx.id,
    'customer_name',   v_cust.name,
    'amount',          p_amount,
    'balance_before',  v_before,
    'balance_after',   v_tx.balance_after,
    'applied_to_debt', v_applied,
    'credit_added',    p_amount - v_applied);
end;
$fn$;

create function public.record_customer_adjustment(
  p_business_id uuid,
  p_customer_id uuid,
  p_amount      numeric,
  p_reason      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_cust   record;
  v_tx     public.customer_transactions;
begin
  if not public.has_permission(p_business_id, 'customers.adjust') then
    raise exception 'You do not have permission to adjust customer balances' using errcode = '42501';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'The adjustment amount cannot be zero';
  end if;
  if abs(p_amount) >= 1000000000000 then raise exception 'The adjustment amount is too large'; end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'The adjustment amount can have at most 2 decimal places';
  end if;
  if v_reason is null then raise exception 'Give a reason for this adjustment'; end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason can be at most 500 characters';
  end if;

  select c.id, c.name, c.balance into v_cust
    from public.customers c
   where c.id = p_customer_id and c.business_id = p_business_id
     for update;
  if not found then raise exception 'Customer not found in this business'; end if;

  insert into public.customer_transactions (
    business_id, customer_id, txn_type, amount, note)
  values (
    p_business_id, p_customer_id, 'adjustment', p_amount, v_reason)
  returning * into v_tx;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'customer_name',  v_cust.name,
    'amount',         p_amount,
    'balance_before', v_cust.balance,
    'balance_after',  v_tx.balance_after);
end;
$fn$;

revoke all on function public.record_customer_payment(uuid, uuid, numeric, public.payment_method, text, text)
  from public, anon, authenticated;
revoke all on function public.record_customer_adjustment(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.record_customer_payment(uuid, uuid, numeric, public.payment_method, text, text) to authenticated;
grant execute on function public.record_customer_adjustment(uuid, uuid, numeric, text) to authenticated;

-- create_return: debt still owed on the sale now comes from sale_outstanding()
-- (so payments already made are respected). Only that statement is replaced.
do $patch$
declare
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.create_return(uuid,uuid,jsonb,public.refund_method,text)'::regprocedure)
    into v_old;

  v_new := regexp_replace(
    v_old,
    'select\s+greatest\(v_sale\.balance_due\s*-\s*coalesce\(sum\(r\.debt_offset\),\s*0\),\s*0\)\s+into\s+v_outstanding\s+from\s+public\.sale_returns\s+r\s+where\s+r\.business_id\s*=\s*p_business_id\s+and\s+r\.sale_id\s*=\s*p_sale_id;',
    'v_outstanding := public.sale_outstanding(p_business_id, p_sale_id);');

  if v_new = v_old then
    raise exception 'create_return was NOT changed: the expected statement was not found';
  end if;

  execute v_new;
end
$patch$;