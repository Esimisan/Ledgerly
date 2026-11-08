-- ===== internal: previous-period window =====
create or replace function public.analytics_compare_range(p_from date, p_to date, p_tz text)
returns table (eff_to date, prev_from date, prev_to date, is_partial boolean)
language plpgsql stable set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone p_tz)::date;
  v_eff date; v_prev_from date; v_prev_to date;
  v_len integer; v_full integer; v_prev_full integer;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'The end date must be after the start date.' using errcode = '22023';
  end if;
  -- Elapsed part of the range (a month still in progress stops at today).
  v_eff := greatest(p_from, least(p_to, v_today + 1));
  v_len := v_eff - p_from;
  v_full := p_to - p_from;
  if extract(day from p_from) = 1 and p_to = (p_from + interval '1 month')::date then
    -- A calendar month: compare with the previous calendar month.
    v_prev_from := (p_from - interval '1 month')::date;
    v_prev_full := p_from - v_prev_from;
    if v_eff >= p_to then
      v_prev_to := p_from;                                   -- finished month: full previous month
    else
      v_prev_to := v_prev_from + least(v_len, v_prev_full);  -- running month: same elapsed days
    end if;
  else
    -- Any other range: the window of the same length right before it.
    v_prev_from := p_from - v_full;
    v_prev_to := v_prev_from + v_len;
  end if;
  return query select v_eff, v_prev_from, v_prev_to, v_eff < p_to;
end $$;

-- ===== internal: access check. Returns true when the caller has finance.view =====
create or replace function public.analytics_access(p_business_id uuid)
returns boolean
language plpgsql stable set search_path = ''
as $$
begin
  if p_business_id is null or not public.is_member(p_business_id) then
    raise exception 'You do not have access to this business.' using errcode = '42501';
  end if;
  return public.has_permission(p_business_id, 'finance.view');
end $$;

-- ===== internal: one metric as {current, previous, change_pct} =====
create or replace function public.analytics_metric(p_current numeric, p_previous numeric)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'current', p_current,
    'previous', p_previous,
    'change_pct', case when p_current is null or p_previous is null or p_previous = 0 then null
                       else round((p_current - p_previous) / abs(p_previous) * 100, 1) end);
$$;

-- ===== internal: all the totals of one window [p_from, p_to) =====
create or replace function public.analytics_window_totals(
  p_business_id uuid, p_from date, p_to date, p_tz text)
returns table (
  gross_sales numeric, refunds numeric, orders bigint,
  units_sold numeric, cogs numeric, operating_expenses numeric)
language sql stable security definer set search_path = ''
as $$
  with b as (
    select (p_from::timestamp at time zone p_tz) as t0,
           (p_to::timestamp at time zone p_tz) as t1
  ),
  s as (
    select coalesce(sum(x.total), 0) as gross, count(*) as n, coalesce(sum(x.cost_total), 0) as cost
    from public.sales x cross join b
    where x.business_id = p_business_id and x.status = 'completed'
      and x.sold_at >= b.t0 and x.sold_at < b.t1
  ),
  u as (
    select coalesce(sum(si.quantity), 0) as units
    from public.sales x
    join public.sale_items si on si.sale_id = x.id
    cross join b
    where x.business_id = p_business_id and x.status = 'completed'
      and x.sold_at >= b.t0 and x.sold_at < b.t1
  ),
  r as (
    select coalesce(sum(rt.refund_total), 0) as refund
    from public.sale_returns rt cross join b
    where rt.business_id = p_business_id and rt.returned_at >= b.t0 and rt.returned_at < b.t1
  ),
  ri as (
    select coalesce(sum(rit.quantity), 0) as units_back,
           coalesce(sum(case when rit.restocked then rit.quantity * si.unit_cost else 0 end), 0) as cost_back
    from public.sale_returns rt
    join public.sale_return_items rit on rit.sale_return_id = rt.id
    join public.sale_items si on si.id = rit.sale_item_id
    cross join b
    where rt.business_id = p_business_id and rt.returned_at >= b.t0 and rt.returned_at < b.t1
  ),
  e as (
    select coalesce(sum(ex.amount), 0) as opex
    from public.expenses ex
    where ex.business_id = p_business_id and ex.voided_at is null
      and ex.expense_date >= p_from and ex.expense_date < p_to
  )
  select s.gross::numeric, r.refund::numeric, s.n::bigint,
         (u.units - ri.units_back)::numeric, (s.cost - ri.cost_back)::numeric, e.opex::numeric
  from s, u, r, ri, e;
$$;

-- ===== public: the KPI cards =====
create or replace function public.analytics_kpis(
  p_business_id uuid, p_from date, p_to date, p_tz text default 'Africa/Lagos')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fin boolean;
  rng record; c record; p record;
  v_rev_c numeric; v_rev_p numeric;
  v_aov_c numeric; v_aov_p numeric;
  v_gp_c numeric;  v_gp_p numeric;
  v_mg_c numeric;  v_mg_p numeric;
  v_np_c numeric;  v_np_p numeric;
begin
  v_fin := public.analytics_access(p_business_id);
  select * into rng from public.analytics_compare_range(p_from, p_to, p_tz);
  select * into c from public.analytics_window_totals(p_business_id, p_from, p_to, p_tz);
  select * into p from public.analytics_window_totals(p_business_id, rng.prev_from, rng.prev_to, p_tz);

  v_rev_c := c.gross_sales - c.refunds;
  v_rev_p := p.gross_sales - p.refunds;
  v_aov_c := case when c.orders > 0 then round(c.gross_sales / c.orders, 2) end;
  v_aov_p := case when p.orders > 0 then round(p.gross_sales / p.orders, 2) end;
  v_gp_c := v_rev_c - c.cogs;
  v_gp_p := v_rev_p - p.cogs;
  v_mg_c := case when v_rev_c <> 0 then round(v_gp_c / v_rev_c * 100, 1) end;
  v_mg_p := case when v_rev_p <> 0 then round(v_gp_p / v_rev_p * 100, 1) end;
  v_np_c := v_gp_c - c.operating_expenses;
  v_np_p := v_gp_p - p.operating_expenses;

  return jsonb_build_object(
    'can_view_finance', v_fin,
    'is_partial', rng.is_partial,
    'timezone', p_tz,
    'refreshed_at', now(),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'compare', jsonb_build_object('from', rng.prev_from, 'to', rng.prev_to),
    'kpis', jsonb_build_object(
      'revenue',         public.analytics_metric(v_rev_c, v_rev_p),
      'gross_sales',     public.analytics_metric(c.gross_sales, p.gross_sales),
      'refunds',         public.analytics_metric(c.refunds, p.refunds),
      'orders',          public.analytics_metric(c.orders::numeric, p.orders::numeric),
      'avg_order_value', public.analytics_metric(v_aov_c, v_aov_p),
      'units_sold',      public.analytics_metric(c.units_sold, p.units_sold),
      -- Finance-only fields: JSON null when the caller lacks finance.view.
      'cogs',               case when v_fin then public.analytics_metric(c.cogs, p.cogs) end,
      'gross_profit',       case when v_fin then public.analytics_metric(v_gp_c, v_gp_p) end,
      'gross_margin_pct',   case when v_fin then jsonb_build_object(
                                'current', v_mg_c, 'previous', v_mg_p,
                                'change_points', case when v_mg_c is null or v_mg_p is null
                                                      then null else round(v_mg_c - v_mg_p, 1) end) end,
      'operating_expenses', case when v_fin then public.analytics_metric(c.operating_expenses, p.operating_expenses) end,
      'net_profit',         case when v_fin then public.analytics_metric(v_np_c, v_np_p) end
    ));
end $$;

-- ===== public: the area chart (zero-filled) =====
-- day   = every day of [p_from, p_to), stopping at today for a running month
-- week  = Monday-start weeks, first and last clipped to the month (they add up to the KPI)
-- month = the 12 calendar months ending with the month of p_from
create or replace function public.analytics_sales_series(
  p_business_id uuid, p_from date, p_to date,
  p_granularity text default 'day', p_tz text default 'Africa/Lagos')
returns table (bucket_start date, bucket_end date, revenue numeric, orders bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone p_tz)::date;
  v_d0 date; v_d1 date;
begin
  perform public.analytics_access(p_business_id);
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'The end date must be after the start date.' using errcode = '22023';
  end if;
  if p_granularity is null or p_granularity not in ('day', 'week', 'month') then
    raise exception 'Choose day, week or month.' using errcode = '22023';
  end if;

  if p_granularity = 'month' then
    v_d0 := (date_trunc('month', p_from::timestamp) - interval '11 months')::date;
    v_d1 := (date_trunc('month', p_from::timestamp) + interval '1 month')::date;
  else
    v_d0 := p_from;
    v_d1 := least(p_to, v_today + 1);
    if v_d1 <= v_d0 then v_d1 := p_to; end if;   -- a future month shows empty zero-filled days
  end if;

  return query
  with b as (
    select (v_d0::timestamp at time zone p_tz) as t0, (v_d1::timestamp at time zone p_tz) as t1
  ),
  sd as (
    select (s.sold_at at time zone p_tz)::date as d, sum(s.total) as gross, count(*) as n
    from public.sales s cross join b
    where s.business_id = p_business_id and s.status = 'completed'
      and s.sold_at >= b.t0 and s.sold_at < b.t1
    group by 1
  ),
  rd as (
    select (r.returned_at at time zone p_tz)::date as d, sum(r.refund_total) as refunded
    from public.sale_returns r cross join b
    where r.business_id = p_business_id and r.returned_at >= b.t0 and r.returned_at < b.t1
    group by 1
  ),
  days as (
    select g::date as d
    from generate_series(v_d0::timestamp, (v_d1 - 1)::timestamp, interval '1 day') as g
  ),
  daily as (
    select dd.d, coalesce(sd.gross, 0) - coalesce(rd.refunded, 0) as rev, coalesce(sd.n, 0) as n
    from days dd
    left join sd on sd.d = dd.d
    left join rd on rd.d = dd.d
  ),
  bucketed as (
    select
      case p_granularity
        when 'day'  then daily.d
        when 'week' then greatest(date_trunc('week', daily.d::timestamp)::date, p_from)
        else date_trunc('month', daily.d::timestamp)::date end as bs,
      case p_granularity
        when 'day'  then daily.d + 1
        when 'week' then least(date_trunc('week', daily.d::timestamp)::date + 7, p_to)
        else (date_trunc('month', daily.d::timestamp) + interval '1 month')::date end as be,
      daily.rev, daily.n
    from daily
  )
  select bk.bs, bk.be, sum(bk.rev)::numeric, sum(bk.n)::bigint
  from bucketed bk
  group by bk.bs, bk.be
  order by bk.bs;
end $$;

-- ===== grants: helpers get nothing; only the two public functions go to authenticated =====
revoke all on function public.analytics_compare_range(date, date, text) from public, anon, authenticated;
revoke all on function public.analytics_access(uuid) from public, anon, authenticated;
revoke all on function public.analytics_metric(numeric, numeric) from public, anon, authenticated;
revoke all on function public.analytics_window_totals(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.analytics_kpis(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.analytics_sales_series(uuid, date, date, text, text) from public, anon, authenticated;

grant execute on function public.analytics_kpis(uuid, date, date, text) to authenticated;
grant execute on function public.analytics_sales_series(uuid, date, date, text, text) to authenticated;