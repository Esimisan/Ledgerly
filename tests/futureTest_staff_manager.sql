-- Ledgerly/tests/step11_staff_manager.sql
-- DEFERRED to Step 13 (needs a second auth user). Replace both ids with real auth user ids.
-- Memberships are created inside the rolled-back test only; nothing is kept.
do $do$
declare
  v_biz uuid := '781b2354-e41a-4c81-ab2b-1f3a84cbe3e9';
  v_staff uuid := '00000000-0000-0000-0000-000000000001';    -- REPLACE
  v_manager uuid := '00000000-0000-0000-0000-000000000002';  -- REPLACE
  v_owner uuid; v_cat uuid;
  v_p uuid := gen_random_uuid(); v_s uuid := gen_random_uuid();
begin
  select m.user_id into v_owner from public.business_members m
   where m.business_id = v_biz and m.role = 'owner' and m.status = 'active' limit 1;

  create function public.zz_t(p_label text, p_sql text, p_expect text, p_save text default null)
  returns void language plpgsql as $f$
  declare
    v_state text := '00000'; v_msg text := ''; v_rows bigint := 0; v_val text;
    v_pass boolean; v_got text; v_es text; v_em text; v_fails integer;
  begin
    begin
      if p_save is not null or p_expect like 'count=%' then
        execute p_sql into v_val;
      else
        execute p_sql;
        get diagnostics v_rows = row_count;
      end if;
      if p_save is not null then
        perform set_config('zz.' || p_save, v_val, true);
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    if p_expect = 'ok' then
      v_pass := v_state = '00000';
    elsif p_expect like 'rows=%' then
      v_pass := v_state = '00000' and v_rows = substr(p_expect, 6)::bigint;
    elsif p_expect like 'count=%' then
      v_pass := v_state = '00000' and v_val = substr(p_expect, 7);
    else
      v_es := split_part(p_expect, ':', 1);
      v_em := nullif(substr(p_expect, length(v_es) + 2), '');
      v_pass := v_state = v_es and (v_em is null or v_msg ilike '%' || v_em || '%');
    end if;
    v_got := case when v_state <> '00000' then v_state || ': ' || v_msg
                  when p_expect like 'count=%' then 'count=' || coalesce(v_val, 'null')
                  else 'rows=' || v_rows end;
    v_fails := coalesce(nullif(current_setting('zz.fails', true), ''), '0')::integer;
    if not v_pass then v_fails := v_fails + 1; end if;
    perform set_config('zz.fails', v_fails::text, true);
    perform set_config('zz.log',
      coalesce(current_setting('zz.log', true), '') || E'\n'
      || case when v_pass then 'PASS ' else 'FAIL ' end || p_label
      || ' [expected ' || p_expect || ', got ' || v_got || ']', true);
  end $f$;

  create function public.zz_g(k text) returns uuid language sql stable
  as $f$ select current_setting('zz.' || k)::uuid $f$;

  create function public.zz_k(p_metric text, p_field text,
                              p_from date default '2025-03-01', p_to date default '2025-04-01')
  returns numeric language sql stable
  as $f$ select (public.analytics_kpis(public.zz_g('biz'), p_from, p_to)->'kpis'->p_metric->>p_field)::numeric $f$;

  grant execute on function public.zz_t(text, text, text, text) to public, anon, authenticated;
  grant execute on function public.zz_g(text) to public, anon, authenticated;
  grant execute on function public.zz_k(text, text, date, date) to public, anon, authenticated;
  perform set_config('zz.biz', v_biz::text, true);

  -- Seed: one product, one March 2025 sale (200, cost 80), one expense (20).
  select c.id into v_cat from public.expense_categories c where c.business_id = v_biz order by c.created_at limit 1;
  delete from public.business_members where business_id = v_biz and user_id in (v_staff, v_manager);
  insert into auth.users (id, instance_id, aud, role, email) values
    (v_staff,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-staff@t.local'),
    (v_manager, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-manager@t.local');

insert into public.business_members (business_id, user_id, role, status) values
    (v_biz, v_staff, 'staff', 'active'), (v_biz, v_manager, 'manager', 'active');
    
  insert into public.products (id, business_id, name, cost_price, selling_price, quantity_on_hand, min_stock_level)
    values (v_p, v_biz, 'ZT SP', 40, 100, 50, 5);
  insert into public.sales (id, business_id, sale_number, customer_id, status, sold_at, subtotal,
                            discount_total, tax_total, total, cost_total, amount_paid, created_by)
    values (v_s, v_biz, 900201, null, 'completed', '2025-03-05 10:00+00', 200, 0, 0, 200, 80, 200, v_owner);
  insert into public.sale_items (id, business_id, sale_id, product_id, product_name, quantity, unit_price, unit_cost, discount_amount)
    values (gen_random_uuid(), v_biz, v_s, v_p, 'ZT SP', 2, 100, 40, 0);
  insert into public.expenses (business_id, category_id, amount, expense_date, description, created_by)
    values (v_biz, v_cat, 20, '2025-03-10', 'ZT exp', v_owner);

  -- ===== STAFF =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  set local role authenticated;

  perform public.zz_t('ST1 staff sees revenue/orders/AOV/units', $q$select public.zz_k('revenue','current') = 200 and public.zz_k('orders','current') = 1 and public.zz_k('avg_order_value','current') = 200 and public.zz_k('units_sold','current') = 2$q$, 'count=true');
  perform public.zz_t('ST2 staff finance fields are JSON null',
    $q$select (k->'cogs') = 'null'::jsonb and (k->'gross_profit') = 'null'::jsonb and (k->'gross_margin_pct') = 'null'::jsonb
              and (k->'operating_expenses') = 'null'::jsonb and (k->'net_profit') = 'null'::jsonb
       from (select public.analytics_kpis(public.zz_g('biz'), '2025-03-01', '2025-04-01')->'kpis' as k) x$q$, 'count=true');
  perform public.zz_t('ST3 staff cannot view finance flag', $q$select (public.analytics_kpis(public.zz_g('biz'), '2025-03-01', '2025-04-01')->>'can_view_finance') = 'false'$q$, 'count=true');
  perform public.zz_t('ST4 staff product row hides cost and profit',
    $q$select revenue = 200 and cogs is null and gross_profit is null and margin_pct is null
       from public.analytics_product_performance(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'top_revenue', 1, 0)$q$, 'count=true');
  perform public.zz_t('ST5 staff most_profitable refused', $q$select * from public.analytics_product_performance(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'most_profitable')$q$, '42501');
  perform public.zz_t('ST6 staff least_profitable refused', $q$select * from public.analytics_product_performance(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'least_profitable')$q$, '42501');
  perform public.zz_t('ST7 staff series ok', $q$select * from public.analytics_sales_series(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'day')$q$, 'ok');
  perform public.zz_t('ST8 staff attention ok', $q$select * from public.analytics_attention(public.zz_g('biz'), '2025-03-01', '2025-04-01')$q$, 'ok');
  perform public.zz_t('ST9 staff stock watch ok', $q$select * from public.analytics_stock_watch(public.zz_g('biz'), 'low')$q$, 'ok');
  perform public.zz_t('ST10 staff customer snapshot ok', $q$select public.analytics_customer_snapshot(public.zz_g('biz'), '2025-03-01', '2025-04-01')$q$, 'ok');
  perform public.zz_t('ST11 staff customer rankings ok', $q$select * from public.analytics_customer_rankings(public.zz_g('biz'), '2025-03-01', '2025-04-01')$q$, 'ok');
  perform public.zz_t('ST12 staff trend: revenue visible, profit and expense columns null',
    $q$select sum(revenue) = 200 and sum(orders) = 1
              and count(*) filter (where gross_profit is not null or operating_expenses is not null or net_profit is not null) = 0
       from public.analytics_trend_series(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'day')$q$, 'count=true');

  -- ===== MANAGER =====
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  set local role authenticated;

  perform public.zz_t('MG1 manager sees cost, profit, expenses', $q$select public.zz_k('cogs','current') = 80 and public.zz_k('gross_profit','current') = 120 and public.zz_k('operating_expenses','current') = 20 and public.zz_k('net_profit','current') = 100$q$, 'count=true');
  perform public.zz_t('MG2 manager can rank by profit', $q$select * from public.analytics_product_performance(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'most_profitable')$q$, 'ok');
  perform public.zz_t('MG5 manager trend shows gross profit 120, expenses 20, net profit 100',
    $q$select sum(gross_profit) = 120 and sum(operating_expenses) = 20 and sum(net_profit) = 100
       from public.analytics_trend_series(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'day')$q$, 'count=true');

  -- Remove finance.view from the manager role: the same call now hides finance fields.
  reset role;
  delete from public.role_permissions where business_id = v_biz and role = 'manager' and permission = 'finance.view';
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  set local role authenticated;
  perform public.zz_t('MG3 without finance.view the manager sees no cost', $q$select public.zz_k('cogs','current') is null and public.zz_k('net_profit','current') is null$q$, 'count=true');
  perform public.zz_t('MG4 without finance.view profit ranking is refused', $q$select * from public.analytics_product_performance(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'most_profitable')$q$, '42501');
  perform public.zz_t('MG6 without finance.view the manager trend hides profit and expenses',
    $q$select sum(revenue) = 200
              and count(*) filter (where gross_profit is not null or operating_expenses is not null or net_profit is not null) = 0
       from public.analytics_trend_series(public.zz_g('biz'), '2025-03-01', '2025-04-01', 'day')$q$, 'count=true');

  -- ===== SUSPENDED MEMBER =====
  reset role;
  update public.business_members set status = 'suspended' where business_id = v_biz and user_id = v_staff;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  set local role authenticated;
  perform public.zz_t('SU1 suspended staff refused', $q$select public.analytics_kpis(public.zz_g('biz'), '2025-03-01', '2025-04-01')$q$, '42501');

  reset role;
  raise exception E'TEST RESULT: % failure(s)%',
    coalesce(nullif(current_setting('zz.fails', true), ''), '0'),
    coalesce(current_setting('zz.log', true), '');
end
$do$;