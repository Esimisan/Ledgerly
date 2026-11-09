-- report helpers, sales summary, sales by product, sales by customer.
-- Date convention for every function here: p_from INCLUSIVE, p_to EXCLUSIVE (same as Step 11).


-- Internal helper: who may run reports. Returns true when the caller has finance.view.

create or replace function public.report_access(
  p_business_id uuid,
  p_need_finance boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_fin boolean;
begin
  if p_business_id is null or not public.is_member(p_business_id) then
    raise exception 'You do not have access to this business.' using errcode = '42501';
  end if;
  if not public.has_permission(p_business_id, 'reports.view') then
    raise exception 'You do not have permission to view reports.' using errcode = '42501';
  end if;
  v_fin := public.has_permission(p_business_id, 'finance.view');
  if p_need_finance and not v_fin then
    raise exception 'This report needs finance access.' using errcode = '42501';
  end if;
  return v_fin;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Internal helper: validates a [from, to) range and the time zone name.
-- ---------------------------------------------------------------------------
create or replace function public.report_check_range(
  p_from date,
  p_to date,
  p_tz text
)
returns void
language plpgsql
stable
set search_path = ''
as $fn$
begin
  if p_from is null or p_to is null then
    raise exception 'Choose a start and an end date.' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'The end of the range must be after its start.' using errcode = '22023';
  end if;
  if p_to - p_from > 1096 then
    raise exception 'Choose a range of three years or less.' using errcode = '22023';
  end if;
  if p_tz is null
     or not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Report 1: sales summary, bucketed by day / week (Monday start) / month.
-- Returns jsonb: { can_view_finance, timezone, granularity, period, totals, rows[] }.
-- cogs / gross_profit / gross_margin_pct are JSON null without finance.view.
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_summary(
  p_business_id uuid,
  p_from date,
  p_to date,
  p_granularity text default 'day',
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
  v_result jsonb;
begin
  v_fin := public.report_access(p_business_id, false);
  perform public.report_check_range(p_from, p_to, p_tz);

  if p_granularity is null or p_granularity not in ('day', 'week', 'month') then
    raise exception 'Group by day, week or month.' using errcode = '22023';
  end if;
  if p_granularity = 'day' and (p_to - p_from) > 366 then
    raise exception 'A day-by-day report can cover at most 366 days. Group by week or month instead.'
      using errcode = '22023';
  end if;

  v_result := (
    with b as (
      select (p_from::timestamp at time zone p_tz) as t0,
             (p_to::timestamp at time zone p_tz) as t1
    ),
    sd as (
      select (s.sold_at at time zone p_tz)::date as d,
             count(*) as orders,
             sum(s.total) as gross,
             sum(s.cost_total) as cost
      from public.sales s
      cross join b
      where s.business_id = p_business_id and s.status = 'completed'
        and s.sold_at >= b.t0 and s.sold_at < b.t1
      group by 1
    ),
    ud as (
      select (s.sold_at at time zone p_tz)::date as d,
             sum(si.quantity) as units
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      cross join b
      where s.business_id = p_business_id and s.status = 'completed'
        and s.sold_at >= b.t0 and s.sold_at < b.t1
      group by 1
    ),
    rd as (
      select (rt.returned_at at time zone p_tz)::date as d,
             sum(rt.refund_total) as refunds
      from public.sale_returns rt
      cross join b
      where rt.business_id = p_business_id
        and rt.returned_at >= b.t0 and rt.returned_at < b.t1
      group by 1
    ),
    rid as (
      select (rt.returned_at at time zone p_tz)::date as d,
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
    days as (
      select g::date as d
      from generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') g
    ),
    per_day as (
      select days.d,
             coalesce(sd.orders, 0) as orders,
             coalesce(sd.gross, 0) as gross,
             coalesce(rd.refunds, 0) as refunds,
             coalesce(ud.units, 0) - coalesce(rid.units_back, 0) as units,
             coalesce(sd.cost, 0) - coalesce(rid.cost_back, 0) as cogs
      from days
      left join sd on sd.d = days.d
      left join ud on ud.d = days.d
      left join rd on rd.d = days.d
      left join rid on rid.d = days.d
    ),
    bk as (
      select case p_granularity
               when 'day' then pd.d
               when 'week' then date_trunc('week', pd.d::timestamp)::date
               else date_trunc('month', pd.d::timestamp)::date
             end as k,
             sum(pd.orders)::bigint as orders,
             sum(pd.gross) as gross,
             sum(pd.refunds) as refunds,
             sum(pd.units) as units,
             sum(pd.cogs) as cogs
      from per_day pd
      group by 1
    )
    select jsonb_build_object(
      'can_view_finance', v_fin,
      'timezone', p_tz,
      'granularity', p_granularity,
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'totals', (
        select jsonb_build_object(
          'orders', t.orders,
          'gross_sales', t.gross,
          'refunds', t.refunds,
          'revenue', t.gross - t.refunds,
          'units_sold', t.units,
          'avg_order_value', case when t.orders > 0 then round(t.gross / t.orders, 2) end,
          'cogs', case when v_fin then t.cogs end,
          'gross_profit', case when v_fin then t.gross - t.refunds - t.cogs end,
          'gross_margin_pct', case when v_fin and (t.gross - t.refunds) <> 0
                                then round((t.gross - t.refunds - t.cogs) / (t.gross - t.refunds) * 100, 1) end
        )
        from (
          select sum(bk.orders)::bigint as orders, sum(bk.gross) as gross,
                 sum(bk.refunds) as refunds, sum(bk.units) as units, sum(bk.cogs) as cogs
          from bk
        ) t
      ),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'bucket_start', greatest(bk.k, p_from),
            'bucket_end', least(
              case p_granularity
                when 'day' then bk.k + 1
                when 'week' then bk.k + 7
                else (bk.k + interval '1 month')::date
              end,
              p_to),
            'orders', bk.orders,
            'gross_sales', bk.gross,
            'refunds', bk.refunds,
            'revenue', bk.gross - bk.refunds,
            'units_sold', bk.units,
            'cogs', case when v_fin then bk.cogs end,
            'gross_profit', case when v_fin then bk.gross - bk.refunds - bk.cogs end
          )
          order by bk.k)
        from bk
      ), '[]'::jsonb)
    )
  );

  return v_result;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Report 2: sales by product (one row per product with activity in the range).
-- p_sort: revenue | units | name | profit* | margin*   (* needs finance.view)
-- p_dir: asc | desc.   p_limit is clamped to 1..1000.
-- Grand totals (over ALL matching rows, not just the page) ride on every row.
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_by_product(
  p_business_id uuid,
  p_from date,
  p_to date,
  p_search text default null,
  p_sort text default 'revenue',
  p_dir text default 'desc',
  p_limit integer default 20,
  p_offset integer default 0,
  p_tz text default 'Africa/Lagos'
)
returns table (
  rank_no bigint,
  product_id uuid,
  product_name text,
  sku text,
  category_name text,
  unit text,
  is_active boolean,
  units_sold numeric,
  revenue numeric,
  quantity_on_hand numeric,
  cogs numeric,
  gross_profit numeric,
  margin_pct numeric,
  total_count bigint,
  total_units numeric,
  total_revenue numeric,
  total_cogs numeric,
  total_gross_profit numeric
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
  v_dir integer;
  v_limit integer;
  v_offset integer;
begin
  v_fin := public.report_access(p_business_id, false);
  perform public.report_check_range(p_from, p_to, p_tz);

  if p_sort is null or p_sort not in ('revenue', 'units', 'name', 'profit', 'margin') then
    raise exception 'Sort by revenue, units, name, profit or margin.' using errcode = '22023';
  end if;
  if p_sort in ('profit', 'margin') and not v_fin then
    raise exception 'Profit figures need finance access.' using errcode = '42501';
  end if;

  v_dir := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 1 else -1 end;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 1000);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  v_like := nullif(btrim(coalesce(p_search, '')), '');
  if v_like is not null then
    v_like := '%' || replace(replace(replace(v_like, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with t as (
    select x.product_id as pid, x.units, x.revenue, x.cogs
    from public.analytics_product_totals(p_business_id, p_from, p_to, p_tz) x
    where x.units <> 0 or x.revenue <> 0
  ),
  j as (
    select t.pid,
           p.name as pname, p.sku as psku, c.name as cname, p.unit as punit,
           p.is_active as pactive, p.quantity_on_hand as qoh,
           t.units, t.revenue, t.cogs
    from t
    join public.products p on p.business_id = p_business_id and p.id = t.pid
    left join public.categories c on c.business_id = p.business_id and c.id = p.category_id
    where v_like is null
       or p.name ilike v_like
       or coalesce(p.sku, '') ilike v_like
  ),
  r as (
    select j.*,
           row_number() over (order by lower(j.pname), j.pid) as name_rank,
           (j.revenue - j.cogs) as gp
    from j
  ),
  s as (
    select r.*,
           count(*) over () as cnt,
           sum(r.units) over () as su,
           sum(r.revenue) over () as sr,
           sum(r.cogs) over () as sc,
           (case p_sort
              when 'revenue' then r.revenue
              when 'units' then r.units
              when 'name' then r.name_rank::numeric
              when 'profit' then r.gp
              when 'margin' then case when r.revenue <> 0 then r.gp / r.revenue end
            end) * v_dir as sk
    from r
  ),
  o as (
    select s.*,
           row_number() over (order by s.sk nulls last, lower(s.pname), s.pid) as rn
    from s
  )
  select o.rn,
         o.pid,
         o.pname,
         o.psku,
         o.cname,
         o.punit,
         o.pactive,
         o.units,
         o.revenue,
         o.qoh,
         case when v_fin then o.cogs end,
         case when v_fin then o.gp end,
         case when v_fin and o.revenue <> 0 then round(o.gp / o.revenue * 100, 1) end,
         o.cnt,
         o.su,
         o.sr,
         case when v_fin then o.sc end,
         case when v_fin then o.sr - o.sc end
  from o
  order by o.rn
  limit v_limit offset v_offset;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Report 3: sales by customer (+ one "Walk-in customers" row).
-- Refunds are attributed through the SALE's customer, so they always land on
-- the customer who bought. p_sort: spent | orders | name | last_purchase.
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_by_customer(
  p_business_id uuid,
  p_from date,
  p_to date,
  p_search text default null,
  p_sort text default 'spent',
  p_dir text default 'desc',
  p_limit integer default 20,
  p_offset integer default 0,
  p_tz text default 'Africa/Lagos'
)
returns table (
  rank_no bigint,
  customer_id uuid,
  customer_name text,
  phone text,
  is_walk_in boolean,
  orders bigint,
  gross_sales numeric,
  refunds numeric,
  net_spent numeric,
  last_purchase_at timestamptz,
  balance numeric,
  total_count bigint,
  total_orders bigint,
  total_gross numeric,
  total_refunds numeric,
  total_net numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_walk constant uuid := '00000000-0000-0000-0000-000000000000';
  v_like text;
  v_dir integer;
  v_limit integer;
  v_offset integer;
begin
  perform public.report_access(p_business_id, false);
  perform public.report_check_range(p_from, p_to, p_tz);

  if p_sort is null or p_sort not in ('spent', 'orders', 'name', 'last_purchase') then
    raise exception 'Sort by spent, orders, name or last_purchase.' using errcode = '22023';
  end if;

  v_dir := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 1 else -1 end;
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
  sd as (
    select coalesce(s.customer_id, v_walk) as ck,
           count(*) as n,
           sum(s.total) as gross
    from public.sales s
    cross join b
    where s.business_id = p_business_id and s.status = 'completed'
      and s.sold_at >= b.t0 and s.sold_at < b.t1
    group by 1
  ),
  rd as (
    select coalesce(s.customer_id, v_walk) as ck,
           sum(rt.refund_total) as refunds
    from public.sale_returns rt
    join public.sales s on s.id = rt.sale_id and s.business_id = rt.business_id
    cross join b
    where rt.business_id = p_business_id
      and rt.returned_at >= b.t0 and rt.returned_at < b.t1
    group by 1
  ),
  a as (
    select coalesce(sd.ck, rd.ck) as ck,
           coalesce(sd.n, 0)::bigint as n,
           coalesce(sd.gross, 0) as gross,
           coalesce(rd.refunds, 0) as refunds
    from sd
    full join rd on rd.ck = sd.ck
  ),
  j as (
    select a.ck, a.n, a.gross, a.refunds,
           (a.gross - a.refunds) as net,
           case when a.ck = v_walk then 'Walk-in customers' else c.name end as cname,
           c.phone as cphone,
           c.last_purchase_at as lpa,
           c.balance as cbal
    from a
    left join public.customers c on c.business_id = p_business_id and c.id = a.ck
    where v_like is null
       or (a.ck <> v_walk
           and (c.name ilike v_like or coalesce(c.phone, '') ilike v_like))
  ),
  r as (
    select j.*,
           row_number() over (order by lower(coalesce(j.cname, '')), j.ck) as name_rank
    from j
  ),
  s as (
    select r.*,
           count(*) over () as cnt,
           sum(r.n) over () as sn,
           sum(r.gross) over () as sg,
           sum(r.refunds) over () as srf,
           sum(r.net) over () as snet,
           (case p_sort
              when 'spent' then r.net
              when 'orders' then r.n::numeric
              when 'name' then r.name_rank::numeric
              when 'last_purchase' then extract(epoch from r.lpa)::numeric
            end) * v_dir as sk
    from r
  ),
  o as (
    select s.*,
           row_number() over (order by s.sk nulls last, lower(coalesce(s.cname, '')), s.ck) as rn
    from s
  )
  select o.rn,
         nullif(o.ck, v_walk),
         o.cname,
         o.cphone,
         (o.ck = v_walk),
         o.n,
         o.gross,
         o.refunds,
         o.net,
         o.lpa,
         o.cbal,
         o.cnt,
         o.sn::bigint,
         o.sg,
         o.srf,
         o.snet
  from o
  order by o.rn
  limit v_limit offset v_offset;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Grants: nothing for public/anon; only the five client-facing functions for authenticated.
-- The two helpers stay internal (SECURITY DEFINER callers run them as the owner).
-- ---------------------------------------------------------------------------
revoke all on function public.report_access(uuid, boolean) from public, anon, authenticated;
revoke all on function public.report_check_range(date, date, text) from public, anon, authenticated;
revoke all on function public.report_sales_summary(uuid, date, date, text, text) from public, anon, authenticated;
revoke all on function public.report_sales_by_product(uuid, date, date, text, text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.report_sales_by_customer(uuid, date, date, text, text, text, integer, integer, text) from public, anon, authenticated;

grant execute on function public.report_sales_summary(uuid, date, date, text, text) to authenticated;
grant execute on function public.report_sales_by_product(uuid, date, date, text, text, text, integer, integer, text) to authenticated;
grant execute on function public.report_sales_by_customer(uuid, date, date, text, text, text, integer, integer, text) to authenticated;