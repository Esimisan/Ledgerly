-- Step 12 staff/manager tests. DEFERRED to Step 13 (needs a staff and a manager auth user).
do $test$
declare
  v_biz constant uuid := '781b2354-e41a-4c81-ab2b-1f3a84cbe3e9';
  v_staff uuid;
  v_mgr uuid;
begin
  select user_id into v_staff from public.business_members
   where business_id = v_biz and role = 'staff' and status = 'active' limit 1;
  select user_id into v_mgr from public.business_members
   where business_id = v_biz and role = 'manager' and status = 'active' limit 1;
  if v_staff is null or v_mgr is null then
    raise exception 'SKIPPED: this test needs an active staff member and an active manager in the test business (created in Step 13).';
  end if;

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
  create function public.zz_b() returns uuid language sql immutable
  as $f$ select '781b2354-e41a-4c81-ab2b-1f3a84cbe3e9'::uuid $f$;
  grant execute on function public.zz_t(text, text, text, text) to public, anon, authenticated;
  grant execute on function public.zz_g(text) to public, anon, authenticated;
  grant execute on function public.zz_b() to public, anon, authenticated;

  -- ===== STAFF: no reports.view by default =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  set local role authenticated;

  perform public.zz_t('staff: summary denied', $q$select public.report_sales_summary(public.zz_b(),'2026-11-01','2026-12-01','day','Africa/Lagos')$q$, '42501:permission to view reports');
  perform public.zz_t('staff: by product denied', $q$select * from public.report_sales_by_product(public.zz_b(),'2026-11-01','2026-12-01',null,'revenue','desc',20,0)$q$, '42501:permission to view reports');
  perform public.zz_t('staff: by customer denied', $q$select * from public.report_sales_by_customer(public.zz_b(),'2026-11-01','2026-12-01',null,'spent','desc',20,0)$q$, '42501:permission to view reports');
  perform public.zz_t('staff: profit and loss denied', $q$select public.report_profit_and_loss(public.zz_b(),'2026-11-01','2026-12-01','Africa/Lagos')$q$, '42501');
  perform public.zz_t('staff: expenses by category denied', $q$select * from public.report_expenses_by_category(public.zz_b(),'2026-11-01','2026-12-01')$q$, '42501');
  perform public.zz_t('staff: inventory denied', $q$select * from public.report_inventory_movements(public.zz_b(),'2026-11-01','2026-12-01',null,20,0,'Africa/Lagos')$q$, '42501');
  perform public.zz_t('staff: balances denied', $q$select * from public.report_customer_balances(public.zz_b(),'all',null,'balance','desc',20,0)$q$, '42501');
  perform public.zz_t('staff: period summary denied', $q$select public.report_period_summary(public.zz_b(),'month',2026,'Africa/Lagos')$q$, '42501');
  perform public.zz_t('staff: import preview denied', $q$select public.validate_product_import(public.zz_b(), '[{"name":"x"}]'::jsonb)$q$, '42501:permission to import');
  perform public.zz_t('staff: import commit denied', $q$select public.import_products(public.zz_b(), 'x.csv', '[{"name":"x"}]'::jsonb, '{}'::jsonb)$q$, '42501:permission to import');

  -- ===== MANAGER: reports, finance and import all allowed =====
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_mgr::text, true);
  set local role authenticated;

  perform public.zz_t('manager: summary has cogs', $q$select (public.report_sales_summary(public.zz_b(),'2026-11-01','2026-12-01','day','Africa/Lagos')->'totals'->>'cogs') is not null$q$, 'count=true');
  perform public.zz_t('manager: profit and loss allowed', $q$select public.report_profit_and_loss(public.zz_b(),'2026-11-01','2026-12-01','Africa/Lagos') is not null$q$, 'count=true');
  perform public.zz_t('manager: expenses by category allowed', $q$select count(*) >= 0 from public.report_expenses_by_category(public.zz_b(),'2026-11-01','2026-12-01')$q$, 'count=true');
  perform public.zz_t('manager: preview allowed', $q$select (public.validate_product_import(public.zz_b(), '[{"name":"ZZ Mgr Check","sku":"ZZ-MGR"}]'::jsonb)->'counts'->>'create')$q$, 'count=1');

  -- ===== Reports WITHOUT finance: take finance.view away from the manager (rolled back) =====
  reset role;
  delete from public.role_permissions
   where business_id = v_biz and role = 'manager' and permission = 'finance.view';
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_mgr::text, true);
  set local role authenticated;

  perform public.zz_t('no finance: summary still works', $q$select (public.report_sales_summary(public.zz_b(),'2026-11-01','2026-12-01','day','Africa/Lagos')->'totals'->>'revenue') is not null$q$, 'count=true');
  perform public.zz_t('no finance: cogs hidden', $q$select (public.report_sales_summary(public.zz_b(),'2026-11-01','2026-12-01','day','Africa/Lagos')->'totals'->>'cogs') is null$q$, 'count=true');
  perform public.zz_t('no finance: gross profit hidden', $q$select (public.report_sales_summary(public.zz_b(),'2026-11-01','2026-12-01','day','Africa/Lagos')->'totals'->>'gross_profit') is null$q$, 'count=true');
  perform public.zz_t('no finance: per-bucket profit hidden', $q$select (public.report_sales_summary(public.zz_b(),'2026-11-01','2026-12-01','day','Africa/Lagos')->'rows'->0->>'gross_profit') is null$q$, 'count=true');
  perform public.zz_t('no finance: product cost hidden', $q$select bool_and(cogs is null and gross_profit is null and margin_pct is null and total_cogs is null and total_gross_profit is null) from public.report_sales_by_product(public.zz_b(),'2026-11-01','2026-12-01',null,'revenue','desc',20,0)$q$, 'count=true');
  perform public.zz_t('no finance: profit sort denied', $q$select * from public.report_sales_by_product(public.zz_b(),'2026-11-01','2026-12-01',null,'profit','desc',20,0)$q$, '42501:finance access');
  perform public.zz_t('no finance: margin sort denied', $q$select * from public.report_sales_by_product(public.zz_b(),'2026-11-01','2026-12-01',null,'margin','desc',20,0)$q$, '42501:finance access');
  perform public.zz_t('no finance: profit and loss denied', $q$select public.report_profit_and_loss(public.zz_b(),'2026-11-01','2026-12-01','Africa/Lagos')$q$, '42501:needs finance access');
  perform public.zz_t('no finance: expenses by category denied', $q$select * from public.report_expenses_by_category(public.zz_b(),'2026-11-01','2026-12-01')$q$, '42501:needs finance access');
  perform public.zz_t('no finance: purchase value hidden', $q$select bool_and(purchase_value is null) from public.report_inventory_movements(public.zz_b(),'2026-11-01','2026-12-01',null,20,0,'Africa/Lagos')$q$, 'count=true');
  perform public.zz_t('no finance: period finance columns hidden', $q$select (public.report_period_summary(public.zz_b(),'month',2026,'Africa/Lagos')->'totals'->>'net_profit') is null and (public.report_period_summary(public.zz_b(),'month',2026,'Africa/Lagos')->'totals'->>'operating_expenses') is null and (public.report_period_summary(public.zz_b(),'month',2026,'Africa/Lagos')->'totals'->>'revenue') is not null$q$, 'count=true');
  perform public.zz_t('no finance: customer report still works', $q$select count(*) >= 0 from public.report_sales_by_customer(public.zz_b(),'2026-11-01','2026-12-01',null,'spent','desc',20,0)$q$, 'count=true');
  perform public.zz_t('no finance: balances still work', $q$select count(*) >= 0 from public.report_customer_balances(public.zz_b(),'all',null,'balance','desc',20,0)$q$, 'count=true');

  -- ===== Import without inventory.adjust: opening stock refused =====
  reset role;
  delete from public.role_permissions
   where business_id = v_biz and role = 'manager' and permission = 'inventory.adjust';
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_mgr::text, true);
  set local role authenticated;

  perform public.zz_t('import without stock permission: opening stock refused', $q$select public.import_products(public.zz_b(), 'x.csv', '[{"name":"ZZ Mgr Stock","sku":"ZZ-MGR2","opening_stock":"5"}]'::jsonb, '{}'::jsonb)$q$, '42501:Opening stock needs permission');
  perform public.zz_t('import without stock permission: no opening stock is fine', $q$select public.import_products(public.zz_b(), 'x.csv', '[{"name":"ZZ Mgr NoStock","sku":"ZZ-MGR3"}]'::jsonb, '{}'::jsonb)::text$q$, 'ok');

  reset role;
  raise exception E'TEST RESULT: % failure(s)%',
    coalesce(nullif(current_setting('zz.fails', true), ''), '0'),
    coalesce(current_setting('zz.log', true), '');
end
$test$;