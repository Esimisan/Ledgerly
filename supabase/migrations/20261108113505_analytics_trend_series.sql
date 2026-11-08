-- Revenue, orders, gross profit, operating expenses and net profit per bucket (zero-filled).
-- day   = every day of [p_from, p_to), stopping at today for a running month
-- week  = Monday-start weeks, first and last clipped to the month (they add up to the KPIs)
-- month = the 12 calendar months ending with the month of p_from
-- gross_profit / operating_expenses / net_profit are NULL without finance.view.
create or replace function public.analytics_trend_series(
  p_business_id uuid, p_from date, p_to date,
  p_granularity text default 'day', p_tz text default 'Africa/Lagos')
returns table (
  bucket_start date, bucket_end date, revenue numeric, orders bigint,
  gross_profit numeric, operating_expenses numeric, net_profit numeric)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_fin boolean;
  v_today date := (now() at time zone p_tz)::date;
  v_d0 date; v_d1 date;
begin
  v_fin := public.analytics_access(p_business_id);
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
  sd as (   -- completed sales by day: money in, cost of goods, order count
    select (s.sold_at at time zone p_tz)::date as d,
           sum(s.total) as gross, sum(s.cost_total) as cost, count(*) as n
    from public.sales s cross join b
    where s.business_id = p_business_id and s.status = 'completed'
      and s.sold_at >= b.t0 and s.sold_at < b.t1
    group by 1
  ),
  rd as (   -- refunds by the day they were given
    select (r.returned_at at time zone p_tz)::date as d, sum(r.refund_total) as refunded
    from public.sale_returns r cross join b
    where r.business_id = p_business_id and r.returned_at >= b.t0 and r.returned_at < b.t1
    group by 1
  ),
  rc as (   -- cost of RESTOCKED returned items goes back; damaged returns keep their cost
    select (r.returned_at at time zone p_tz)::date as d, sum(rit.quantity * si.unit_cost) as cost_back
    from public.sale_returns r
    join public.sale_return_items rit on rit.sale_return_id = r.id and rit.restocked
    join public.sale_items si on si.id = rit.sale_item_id
    cross join b
    where r.business_id = p_business_id and r.returned_at >= b.t0 and r.returned_at < b.t1
    group by 1
  ),
  ed as (   -- operating expenses by expense_date (a plain date, no timezone), voided excluded
    select ex.expense_date as d, sum(ex.amount) as spent
    from public.expenses ex
    where ex.business_id = p_business_id and ex.voided_at is null
      and ex.expense_date >= v_d0 and ex.expense_date < v_d1
    group by 1
  ),
  days as (
    select g::date as d
    from generate_series(v_d0::timestamp, (v_d1 - 1)::timestamp, interval '1 day') as g
  ),
  daily as (
    select dd.d,
           coalesce(sd.gross, 0) - coalesce(rd.refunded, 0) as rev,
           coalesce(sd.n, 0) as n,
           (coalesce(sd.gross, 0) - coalesce(rd.refunded, 0))
             - (coalesce(sd.cost, 0) - coalesce(rc.cost_back, 0)) as gp,
           coalesce(ed.spent, 0) as opex
    from days dd
    left join sd on sd.d = dd.d
    left join rd on rd.d = dd.d
    left join rc on rc.d = dd.d
    left join ed on ed.d = dd.d
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
      daily.rev, daily.n, daily.gp, daily.opex
    from daily
  )
  select bk.bs, bk.be,
         sum(bk.rev)::numeric,
         sum(bk.n)::bigint,
         (case when v_fin then sum(bk.gp) end)::numeric,
         (case when v_fin then sum(bk.opex) end)::numeric,
         (case when v_fin then sum(bk.gp) - sum(bk.opex) end)::numeric
  from bucketed bk
  group by bk.bs, bk.be
  order by bk.bs;
end $$;

revoke all on function public.analytics_trend_series(uuid, date, date, text, text) from public, anon, authenticated;
grant execute on function public.analytics_trend_series(uuid, date, date, text, text) to authenticated;