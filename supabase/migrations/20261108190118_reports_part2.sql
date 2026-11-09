
create index if not exists customers_balance_idx
  on public.customers (business_id, balance)
  where balance <> 0;

-- ---------------------------------------------------------------------------
-- Report 4: profit and loss (needs finance.view).
-- ---------------------------------------------------------------------------
create or replace function public.report_profit_and_loss(
  p_business_id uuid,
  p_from date,
  p_to date,
  p_tz text default 'Africa/Lagos'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  w record;
  v_rev numeric;
  v_gp numeric;
  v_net numeric;
  v_cats jsonb;
begin
  perform public.report_access(p_business_id, true);
  perform public.report_check_range(p_from, p_to, p_tz);

  select * into w from public.analytics_window_totals(p_business_id, p_from, p_to, p_tz);

  v_rev := w.gross_sales - w.refunds;
  v_gp := v_rev - w.cogs;
  v_net := v_gp - w.operating_expenses;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'category_id', x.cid,
             'category_name', x.cname,
             'total', x.total,
             'expense_count', x.n,
             'share_pct', case when w.operating_expenses <> 0
                            then round(x.total / w.operating_expenses * 100, 1) end)
           order by x.total desc, x.cname), '[]'::jsonb)
    into v_cats
  from (
    select ec.id as cid, ec.name as cname, sum(e.amount) as total, count(*) as n
    from public.expenses e
    join public.expense_categories ec
      on ec.business_id = e.business_id and ec.id = e.category_id
    where e.business_id = p_business_id and e.voided_at is null
      and e.expense_date >= p_from and e.expense_date < p_to
    group by ec.id, ec.name
  ) x;

  return jsonb_build_object(
    'timezone', p_tz,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'orders', w.orders,
    'gross_sales', w.gross_sales,
    'refunds', w.refunds,
    'revenue', v_rev,
    'cogs', w.cogs,
    'gross_profit', v_gp,
    'gross_margin_pct', case when v_rev <> 0 then round(v_gp / v_rev * 100, 1) end,
    'operating_expenses', w.operating_expenses,
    'net_profit', v_net,
    'net_margin_pct', case when v_rev <> 0 then round(v_net / v_rev * 100, 1) end,
    'expense_categories', v_cats
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- Report 5: expenses by category (needs finance.view). Non-voided, by expense_date.
-- ---------------------------------------------------------------------------
create or replace function public.report_expenses_by_category(
  p_business_id uuid,
  p_from date,
  p_to date
)
returns table (
  category_id uuid,
  category_name text,
  total numeric,
  expense_count bigint,
  share_pct numeric,
  grand_total numeric,
  grand_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
begin
  perform public.report_access(p_business_id, true);
  perform public.report_check_range(p_from, p_to, 'UTC');

  return query
  with x as (
    select ec.id as cid, ec.name as cname, sum(e.amount) as tot, count(*) as n
    from public.expenses e
    join public.expense_categories ec
      on ec.business_id = e.business_id and ec.id = e.category_id
    where e.business_id = p_business_id and e.voided_at is null
      and e.expense_date >= p_from and e.expense_date < p_to
    group by ec.id, ec.name
  )
  select x.cid,
         x.cname,
         x.tot,
         x.n,
         case when sum(x.tot) over () <> 0
              then round(x.tot / sum(x.tot) over () * 100, 1) end,
         sum(x.tot) over (),
         (sum(x.n) over ())::bigint
  from x
  order by x.tot desc, x.cname;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Report 6: inventory movement summary per product, from stock_movements.
-- opening = everything before p_from; closing = everything before p_to.
-- purchase_value is NULL without finance.view.
-- ---------------------------------------------------------------------------
create or replace function public.report_inventory_movements(
  p_business_id uuid,
  p_from date,
  p_to date,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_tz text default 'Africa/Lagos'
)
returns table (
  product_id uuid,
  product_name text,
  sku text,
  unit text,
  is_active boolean,
  is_deleted boolean,
  opening numeric,
  opening_stock_added numeric,
  purchased numeric,
  sold numeric,
  returned numeric,
  damaged numeric,
  removed numeric,
  adjusted numeric,
  closing numeric,
  purchase_value numeric,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_fin boolean;
  v_like text;
  v_limit integer;
  v_offset integer;
begin
  v_fin := public.report_access(p_business_id, false);
  perform public.report_check_range(p_from, p_to, p_tz);

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 1000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_like := nullif(btrim(coalesce(p_search, '')), '');
  if v_like is not null then
    v_like := '%' || replace(replace(replace(v_like, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with b as (
    select (p_from::timestamp at time zone p_tz) as t0,
           (p_to::timestamp at time zone p_tz) as t1
  ),
  m as (
    select sm.product_id as pid,
           coalesce(sum(sm.quantity_change) filter (where sm.created_at < b.t0), 0) as o_open,
           coalesce(sum(sm.quantity_change) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'opening_stock'), 0) as o_os,
           coalesce(sum(sm.quantity_change) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'purchase'), 0) as o_pur,
           coalesce(-sum(sm.quantity_change) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'sale'), 0) as o_sold,
           coalesce(sum(sm.quantity_change) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'sale_return'), 0) as o_ret,
           coalesce(-sum(sm.quantity_change) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'damage'), 0) as o_dam,
           coalesce(-sum(sm.quantity_change) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'removal'), 0) as o_rem,
           coalesce(sum(sm.quantity_change) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'adjustment'), 0) as o_adj,
           coalesce(sum(sm.quantity_change), 0) as o_close,
           coalesce(sum(sm.quantity_change * sm.unit_cost) filter (
             where sm.created_at >= b.t0 and sm.movement_type = 'purchase'), 0) as o_pv,
           count(*) filter (where sm.created_at >= b.t0) as period_n
    from public.stock_movements sm
    cross join b
    where sm.business_id = p_business_id and sm.created_at < b.t1
    group by sm.product_id
  ),
  j as (
    select m.*, p.name as pname, p.sku as psku, p.unit as punit,
           p.is_active as pactive, (p.deleted_at is not null) as pdel
    from m
    join public.products p on p.business_id = p_business_id and p.id = m.pid
    where (m.o_open <> 0 or m.period_n > 0)
      and (v_like is null or p.name ilike v_like or coalesce(p.sku, '') ilike v_like)
  ),
  s as (
    select j.*, count(*) over () as cnt from j
  )
  select s.pid, s.pname, s.psku, s.punit, s.pactive, s.pdel,
         s.o_open, s.o_os, s.o_pur, s.o_sold, s.o_ret, s.o_dam, s.o_rem, s.o_adj,
         s.o_close,
         case when v_fin then s.o_pv end,
         s.cnt
  from s
  order by lower(s.pname), s.pid
  limit v_limit offset v_offset;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Report 7: customer balances, a snapshot as of now (not a period).
-- p_status: owing | credit | all (all = any non-zero balance).
-- p_sort: balance | name | last_purchase. Totals cover every matching row.
-- ---------------------------------------------------------------------------
create or replace function public.report_customer_balances(
  p_business_id uuid,
  p_status text default 'owing',
  p_search text default null,
  p_sort text default 'balance',
  p_dir text default 'desc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  rank_no bigint,
  customer_id uuid,
  customer_name text,
  phone text,
  is_active boolean,
  balance numeric,
  last_purchase_at timestamptz,
  last_payment_at timestamptz,
  total_count bigint,
  total_owed numeric,
  total_credit numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_like text;
  v_dir integer;
  v_limit integer;
  v_offset integer;
begin
  perform public.report_access(p_business_id, false);

  if p_status is null or p_status not in ('owing', 'credit', 'all') then
    raise exception 'Choose owing, credit or all.' using errcode = '22023';
  end if;
  if p_sort is null or p_sort not in ('balance', 'name', 'last_purchase') then
    raise exception 'Sort by balance, name or last_purchase.' using errcode = '22023';
  end if;

  v_dir := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 1 else -1 end;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 1000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_like := nullif(btrim(coalesce(p_search, '')), '');
  if v_like is not null then
    v_like := '%' || replace(replace(replace(v_like, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with f as (
    select c.id as cid, c.name as cname, c.phone as cphone, c.is_active as cactive,
           c.balance as cbal, c.last_purchase_at as lpa
    from public.customers c
    where c.business_id = p_business_id
      and c.balance <> 0
      and (p_status = 'all'
           or (p_status = 'owing' and c.balance > 0)
           or (p_status = 'credit' and c.balance < 0))
      and (v_like is null
           or c.name ilike v_like
           or coalesce(c.phone, '') ilike v_like
           or coalesce(c.email, '') ilike v_like)
  ),
  r as (
    select f.*, row_number() over (order by lower(f.cname), f.cid) as name_rank from f
  ),
  s as (
    select r.*,
           count(*) over () as cnt,
           coalesce(sum(r.cbal) filter (where r.cbal > 0) over (), 0) as s_owed,
           coalesce(-sum(r.cbal) filter (where r.cbal < 0) over (), 0) as s_credit,
           (case p_sort
              when 'balance' then r.cbal
              when 'name' then r.name_rank::numeric
              when 'last_purchase' then extract(epoch from r.lpa)::numeric
            end) * v_dir as sk
    from r
  ),
  o as (
    select s.*, row_number() over (order by s.sk nulls last, lower(s.cname), s.cid) as rn
    from s
  )
  select o.rn,
         o.cid,
         o.cname,
         o.cphone,
         o.cactive,
         o.cbal,
         o.lpa,
         (select max(t.created_at)
            from public.customer_transactions t
           where t.business_id = p_business_id
             and t.customer_id = o.cid
             and t.txn_type = 'payment'),
         o.cnt,
         o.s_owed,
         o.s_credit
  from o
  where o.rn > v_offset and o.rn <= v_offset + v_limit
  order by o.rn;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Report 8: monthly (12 months of p_year) or yearly (up to 10 years ending p_year,
-- leaving out years before the first sale or expense). Finance columns are NULL
-- without finance.view. Buckets use the p_tz calendar.
-- ---------------------------------------------------------------------------
create or replace function public.report_period_summary(
  p_business_id uuid,
  p_mode text default 'month',
  p_year integer default null,
  p_tz text default 'Africa/Lagos'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_fin boolean;
  v_year integer;
  v_unit text;
  v_step interval;
  v_first integer;
  v_start date;
  v_end date;
  v_result jsonb;
begin
  v_fin := public.report_access(p_business_id, false);

  if p_mode is null or p_mode not in ('month', 'year') then
    raise exception 'Choose month or year.' using errcode = '22023';
  end if;
  if p_tz is null
     or not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;

  v_year := coalesce(p_year, extract(year from (now() at time zone p_tz))::integer);
  if v_year < 2000 or v_year > 2100 then
    raise exception 'Choose a year between 2000 and 2100.' using errcode = '22023';
  end if;

  if p_mode = 'month' then
    v_unit := 'month';
    v_step := interval '1 month';
    v_start := make_date(v_year, 1, 1);
  else
    v_unit := 'year';
    v_step := interval '1 year';
    v_first := least(
      coalesce(extract(year from (
        (select min(s.sold_at) from public.sales s
          where s.business_id = p_business_id and s.status = 'completed') at time zone p_tz
      ))::integer, v_year),
      coalesce(extract(year from (
        select min(e.expense_date) from public.expenses e
         where e.business_id = p_business_id and e.voided_at is null
      ))::integer, v_year),
      v_year);
    v_start := make_date(greatest(v_year - 9, v_first), 1, 1);
  end if;
  v_end := make_date(v_year + 1, 1, 1);

  v_result := (
    with b as (
      select (v_start::timestamp at time zone p_tz) as t0,
             (v_end::timestamp at time zone p_tz) as t1
    ),
    sd as (
      select date_trunc(v_unit, (s.sold_at at time zone p_tz))::date as k,
             count(*) as orders, sum(s.total) as gross, sum(s.cost_total) as cost
      from public.sales s cross join b
      where s.business_id = p_business_id and s.status = 'completed'
        and s.sold_at >= b.t0 and s.sold_at < b.t1
      group by 1
    ),
    ud as (
      select date_trunc(v_unit, (s.sold_at at time zone p_tz))::date as k,
             sum(si.quantity) as units
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      cross join b
      where s.business_id = p_business_id and s.status = 'completed'
        and s.sold_at >= b.t0 and s.sold_at < b.t1
      group by 1
    ),
    rd as (
      select date_trunc(v_unit, (rt.returned_at at time zone p_tz))::date as k,
             sum(rt.refund_total) as refunds
      from public.sale_returns rt cross join b
      where rt.business_id = p_business_id
        and rt.returned_at >= b.t0 and rt.returned_at < b.t1
      group by 1
    ),
    rid as (
      select date_trunc(v_unit, (rt.returned_at at time zone p_tz))::date as k,
             sum(rit.quantity) as units_back,
             sum(case when rit.restocked then rit.quantity * si.unit_cost else 0 end) as cost_back
      from public.sale_returns rt
      join public.sale_return_items rit on rit.sale_return_id = rt.id
      join public.sale_items si on si.id = rit.sale_item_id
      cross join b
      where rt.business_id = p_business_id
        and rt.returned_at >= b.t0 and rt.returned_at < b.t1
      group by 1
    ),
    ed as (
      select date_trunc(v_unit, e.expense_date::timestamp)::date as k,
             sum(e.amount) as opex
      from public.expenses e
      where e.business_id = p_business_id and e.voided_at is null
        and e.expense_date >= v_start and e.expense_date < v_end
      group by 1
    ),
    bk as (
      select g::date as k,
             coalesce(sd.orders, 0)::bigint as orders,
             coalesce(sd.gross, 0) as gross,
             coalesce(rd.refunds, 0) as refunds,
             coalesce(ud.units, 0) - coalesce(rid.units_back, 0) as units,
             coalesce(sd.cost, 0) - coalesce(rid.cost_back, 0) as cogs,
             coalesce(ed.opex, 0) as opex
      from generate_series(v_start::timestamp, (v_end - 1)::timestamp, v_step) g
      left join sd on sd.k = g::date
      left join ud on ud.k = g::date
      left join rd on rd.k = g::date
      left join rid on rid.k = g::date
      left join ed on ed.k = g::date
    )
    select jsonb_build_object(
      'can_view_finance', v_fin,
      'mode', p_mode,
      'year', v_year,
      'timezone', p_tz,
      'period', jsonb_build_object('from', v_start, 'to', v_end),
      'totals', (
        select jsonb_build_object(
          'orders', t.orders,
          'gross_sales', t.gross,
          'refunds', t.refunds,
          'revenue', t.gross - t.refunds,
          'units_sold', t.units,
          'cogs', case when v_fin then t.cogs end,
          'gross_profit', case when v_fin then t.gross - t.refunds - t.cogs end,
          'operating_expenses', case when v_fin then t.opex end,
          'net_profit', case when v_fin then t.gross - t.refunds - t.cogs - t.opex end)
        from (
          select sum(bk.orders)::bigint as orders, sum(bk.gross) as gross,
                 sum(bk.refunds) as refunds, sum(bk.units) as units,
                 sum(bk.cogs) as cogs, sum(bk.opex) as opex
          from bk
        ) t
      ),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'bucket_start', bk.k,
            'bucket_end', (bk.k + v_step)::date,
            'orders', bk.orders,
            'gross_sales', bk.gross,
            'refunds', bk.refunds,
            'revenue', bk.gross - bk.refunds,
            'units_sold', bk.units,
            'cogs', case when v_fin then bk.cogs end,
            'gross_profit', case when v_fin then bk.gross - bk.refunds - bk.cogs end,
            'operating_expenses', case when v_fin then bk.opex end,
            'net_profit', case when v_fin then bk.gross - bk.refunds - bk.cogs - bk.opex end)
          order by bk.k)
        from bk
      ), '[]'::jsonb)
    )
  );

  return v_result;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.report_profit_and_loss(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.report_expenses_by_category(uuid, date, date) from public, anon, authenticated;
revoke all on function public.report_inventory_movements(uuid, date, date, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.report_customer_balances(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.report_period_summary(uuid, text, integer, text) from public, anon, authenticated;

grant execute on function public.report_profit_and_loss(uuid, date, date, text) to authenticated;
grant execute on function public.report_expenses_by_category(uuid, date, date) to authenticated;
grant execute on function public.report_inventory_movements(uuid, date, date, text, integer, integer, text) to authenticated;
grant execute on function public.report_customer_balances(uuid, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.report_period_summary(uuid, text, integer, text) to authenticated;