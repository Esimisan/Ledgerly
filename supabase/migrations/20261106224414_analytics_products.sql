-- ===== internal: per-product units / revenue / cost of one window =====
create or replace function public.analytics_product_totals(
  p_business_id uuid, p_from date, p_to date, p_tz text)
returns table (product_id uuid, units numeric, revenue numeric, cogs numeric)
language sql stable security definer set search_path = ''
as $$
  with b as (
    select (p_from::timestamp at time zone p_tz) as t0, (p_to::timestamp at time zone p_tz) as t1
  ),
  gross as (
    select si.product_id as pid, sum(si.quantity) as units, sum(si.line_total) as revenue,
           sum(si.quantity * si.unit_cost) as cogs
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    cross join b
    where s.business_id = p_business_id and s.status = 'completed'
      and s.sold_at >= b.t0 and s.sold_at < b.t1
    group by si.product_id
  ),
  back as (
    select rit.product_id as pid, sum(rit.quantity) as units, sum(rit.line_total) as revenue,
           sum(case when rit.restocked then rit.quantity * si.unit_cost else 0 end) as cogs
    from public.sale_returns rt
    join public.sale_return_items rit on rit.sale_return_id = rt.id
    join public.sale_items si on si.id = rit.sale_item_id
    cross join b
    where rt.business_id = p_business_id and rt.returned_at >= b.t0 and rt.returned_at < b.t1
    group by rit.product_id
  )
  select coalesce(g.pid, k.pid),
         (coalesce(g.units, 0) - coalesce(k.units, 0))::numeric,
         (coalesce(g.revenue, 0) - coalesce(k.revenue, 0))::numeric,
         (coalesce(g.cogs, 0) - coalesce(k.cogs, 0))::numeric
  from gross g
  full join back k on k.pid = g.pid;
$$;

-- ===== internal: stock flags for every live product (rolling windows, "as of now") =====
-- is_out: nothing left. is_low: above 0 but at or under the minimum level (minimum > 0).
-- is_approaching: not low, and at the last-30-days sales pace it runs out within 14 days.
-- is_unsold: in stock, older than 30 days, no completed sale in the last 30 days.
-- last_sold_at is only filled for unsold candidates (no sale in 30 days).
create or replace function public.analytics_stock_flags(p_business_id uuid)
returns table (
  product_id uuid, product_name text, sku text, image_path text, unit text,
  quantity_on_hand numeric, min_stock_level numeric, units_30d numeric,
  last_sold_at timestamptz, days_of_cover numeric,
  is_out boolean, is_low boolean, is_approaching boolean, is_unsold boolean)
language sql stable security definer set search_path = ''
as $$
  with sold as (
    select si.product_id as pid, sum(si.quantity)::numeric as units
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.business_id = p_business_id and s.status = 'completed'
      and s.sold_at >= now() - interval '30 days'
    group by si.product_id
  ),
  base as (
    select p.id as pid, p.name::text as pname, p.sku::text as psku, p.image_path::text as pimg,
           p.unit::text as punit, p.quantity_on_hand::numeric as qoh, p.min_stock_level::numeric as minl,
           p.created_at as created, coalesce(sd.units, 0) as u30
    from public.products p
    left join sold sd on sd.pid = p.id
    where p.business_id = p_business_id and p.is_active and p.deleted_at is null
  )
  select b.pid, b.pname, b.psku, b.pimg, b.punit, b.qoh, b.minl, b.u30,
         ls.last_at,
         case when b.u30 > 0 then round(b.qoh / (b.u30 / 30.0), 1) end,
         b.qoh <= 0,
         (b.qoh > 0 and b.minl > 0 and b.qoh <= b.minl),
         (b.qoh > 0 and not (b.minl > 0 and b.qoh <= b.minl)
            and b.u30 > 0 and b.qoh / (b.u30 / 30.0) <= 14),
         (b.qoh > 0 and b.u30 = 0 and b.created <= now() - interval '30 days')
  from base b
  left join lateral (
    select max(s.sold_at) as last_at
    from public.sale_items si
    join public.sales s on s.id = si.sale_id and s.status = 'completed'
    where b.u30 = 0 and b.qoh > 0
      and si.business_id = p_business_id and si.product_id = b.pid
  ) ls on true;
$$;

-- ===== public: product rankings =====
-- p_rank: top_revenue | best_units | worst_units | most_profitable | least_profitable | declining
create or replace function public.analytics_product_performance(
  p_business_id uuid, p_from date, p_to date,
  p_rank text default 'top_revenue',
  p_limit integer default 10, p_offset integer default 0,
  p_tz text default 'Africa/Lagos')
returns table (
  rank_no bigint, product_id uuid, product_name text, sku text, image_path text, unit text,
  units_sold numeric, revenue numeric, previous_units numeric, previous_revenue numeric,
  units_change_pct numeric, revenue_change_pct numeric, share_of_best_pct numeric,
  quantity_on_hand numeric, min_stock_level numeric,
  cogs numeric, gross_profit numeric, margin_pct numeric,
  is_active boolean, total_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_fin boolean; v_cmp record; v_limit integer; v_offset integer;
begin
  v_fin := public.analytics_access(p_business_id);
  if p_rank is null or p_rank not in
     ('top_revenue', 'best_units', 'worst_units', 'most_profitable', 'least_profitable', 'declining') then
    raise exception 'Unknown product ranking.' using errcode = '22023';
  end if;
  if p_rank in ('most_profitable', 'least_profitable') and not v_fin then
    raise exception 'Profit rankings need finance access.' using errcode = '42501';
  end if;
  select * into v_cmp from public.analytics_compare_range(p_from, p_to, p_tz);
  v_limit := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset := greatest(0, coalesce(p_offset, 0));

  return query
  with cur as (
    select t.product_id as pid, t.units, t.revenue, t.cogs
    from public.analytics_product_totals(p_business_id, p_from, p_to, p_tz) t
  ),
  prv as (
    select t.product_id as pid, t.units, t.revenue
    from public.analytics_product_totals(p_business_id, v_cmp.prev_from, v_cmp.prev_to, p_tz) t
  ),
  base as (
    select p.id as pid, p.name::text as pname, p.sku::text as psku, p.image_path::text as pimg,
           p.unit::text as punit, p.is_active as pact,
           coalesce(c.units, 0) as u, coalesce(c.revenue, 0) as rev, coalesce(c.cogs, 0) as cg,
           coalesce(v.units, 0) as pu, coalesce(v.revenue, 0) as prev_rev,
           p.quantity_on_hand::numeric as qoh, p.min_stock_level::numeric as minl
    from public.products p
    left join cur c on c.pid = p.id
    left join prv v on v.pid = p.id
    where p.business_id = p_business_id
      and (c.pid is not null
           or (p_rank = 'declining' and v.pid is not null)
           or (p_rank = 'worst_units' and p.is_active and p.deleted_at is null))
  ),
  scored as (
    select b.*,
           case when b.pu > 0 then round((b.u - b.pu) / b.pu * 100, 1) end as u_chg,
           case when b.prev_rev > 0 then round((b.rev - b.prev_rev) / b.prev_rev * 100, 1) end as r_chg,
           case when max(b.rev) over () > 0
                then round(greatest(b.rev, 0) / max(b.rev) over () * 100, 0) else 0 end as share
    from base b
  ),
  kept as (
    select s.* from scored s
    where p_rank <> 'declining' or (s.pu >= 3 and s.prev_rev > 0 and s.r_chg <= -10)
  ),
  ranked as (
    select k.*,
           row_number() over (order by
             case when p_rank = 'top_revenue' then k.rev end desc,
             case when p_rank = 'best_units' then k.u end desc,
             case when p_rank = 'most_profitable' then k.rev - k.cg end desc,
             case when p_rank = 'worst_units' then k.u end asc,
             case when p_rank = 'least_profitable' then k.rev - k.cg end asc,
             case when p_rank = 'declining' then k.r_chg end asc,
             case when p_rank = 'worst_units' then k.qoh end desc,
             k.rev desc, k.pname asc, k.pid) as rn,
           count(*) over () as cnt
    from kept k
  )
  select r.rn, r.pid, r.pname, r.psku, r.pimg, r.punit,
         r.u, r.rev, r.pu, r.prev_rev, r.u_chg, r.r_chg, r.share, r.qoh, r.minl,
         case when v_fin then r.cg end,
         case when v_fin then r.rev - r.cg end,
         case when v_fin and r.rev <> 0 then round((r.rev - r.cg) / r.rev * 100, 1) end,
         r.pact, r.cnt
  from ranked r
  order by r.rn
  limit v_limit offset v_offset;
end $$;

-- ===== public: the "Needs attention" rows (at most 3: low stock, declining, unsold) =====
create or replace function public.analytics_attention(
  p_business_id uuid, p_from date, p_to date, p_tz text default 'Africa/Lagos')
returns table (
  kind text, product_id uuid, product_name text,
  quantity_on_hand numeric, min_stock_level numeric,
  change_pct numeric, current_revenue numeric, previous_revenue numeric,
  affected_count bigint, secondary_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_cmp record;
begin
  perform public.analytics_access(p_business_id);
  select * into v_cmp from public.analytics_compare_range(p_from, p_to, p_tz);

  return query
  with fl as (select * from public.analytics_stock_flags(p_business_id)),
  low_all as (select f.* from fl f where f.is_low or f.is_out),
  low_pick as (
    select l.* from low_all l
    order by l.is_out desc, l.quantity_on_hand / greatest(l.min_stock_level, 1) asc, l.product_name
    limit 1
  ),
  cur as (
    select t.product_id as pid, t.units, t.revenue
    from public.analytics_product_totals(p_business_id, p_from, p_to, p_tz) t
  ),
  prv as (
    select t.product_id as pid, t.units, t.revenue
    from public.analytics_product_totals(p_business_id, v_cmp.prev_from, v_cmp.prev_to, p_tz) t
  ),
  dec_all as (
    select p.id as pid, p.name::text as pname, p.quantity_on_hand::numeric as qoh,
           p.min_stock_level::numeric as minl,
           coalesce(c.revenue, 0) as cur_rev, v.revenue as prev_rev,
           round((coalesce(c.revenue, 0) - v.revenue) / v.revenue * 100, 1) as chg
    from prv v
    join public.products p on p.id = v.pid and p.business_id = p_business_id
    left join cur c on c.pid = v.pid
    where v.units >= 3 and v.revenue > 0 and p.is_active and p.deleted_at is null
      and (coalesce(c.revenue, 0) - v.revenue) / v.revenue * 100 <= -10
  ),
  dec_pick as (select d.* from dec_all d order by d.chg asc, d.prev_rev desc limit 1),
  uns_all as (select f.* from fl f where f.is_unsold),
  uns_pick as (select u.* from uns_all u order by u.quantity_on_hand desc, u.product_name limit 1)
  select t.* from (
    select 'low_stock'::text as k, lp.product_id as pid, lp.product_name as pname,
           lp.quantity_on_hand as qoh, lp.min_stock_level as minl,
           null::numeric as chg, null::numeric as cur_rev, null::numeric as prev_rev,
           (select count(*) from low_all) as affected,
           (select count(*) from low_all a where a.is_out) as secondary
    from low_pick lp
    union all
    select 'declining_sales', dp.pid, dp.pname, dp.qoh, dp.minl, dp.chg, dp.cur_rev, dp.prev_rev,
           (select count(*) from dec_all), null::bigint
    from dec_pick dp
    union all
    select 'unsold_inventory', up.product_id, up.product_name, up.quantity_on_hand, up.min_stock_level,
           null::numeric, null::numeric, null::numeric,
           (select count(*) from uns_all), null::bigint
    from uns_pick up
  ) t
  order by case t.k when 'low_stock' then 1 when 'declining_sales' then 2 else 3 end;
end $$;

-- ===== public: product lists for the Analytics page. p_kind: low | approaching | unsold =====
create or replace function public.analytics_stock_watch(
  p_business_id uuid, p_kind text,
  p_limit integer default 20, p_offset integer default 0)
returns table (
  product_id uuid, product_name text, sku text, image_path text, unit text,
  quantity_on_hand numeric, min_stock_level numeric, units_30d numeric,
  days_of_cover numeric, last_sold_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_limit integer; v_offset integer;
begin
  perform public.analytics_access(p_business_id);
  if p_kind is null or p_kind not in ('low', 'approaching', 'unsold') then
    raise exception 'Choose low, approaching or unsold.' using errcode = '22023';
  end if;
  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  return query
  with sel as (
    select f.*, count(*) over () as cnt
    from public.analytics_stock_flags(p_business_id) f
    where (p_kind = 'low' and (f.is_low or f.is_out))
       or (p_kind = 'approaching' and f.is_approaching)
       or (p_kind = 'unsold' and f.is_unsold)
  )
  select s.product_id, s.product_name, s.sku, s.image_path, s.unit,
         s.quantity_on_hand, s.min_stock_level, s.units_30d, s.days_of_cover, s.last_sold_at, s.cnt
  from sel s
  order by
    case when p_kind = 'low' then (case when s.is_out then 0 else 1 end) end asc,
    case when p_kind = 'low' then s.quantity_on_hand / greatest(s.min_stock_level, 1) end asc,
    case when p_kind = 'approaching' then s.days_of_cover end asc,
    case when p_kind = 'unsold' then s.last_sold_at end asc nulls first,
    case when p_kind = 'unsold' then s.quantity_on_hand end desc,
    s.product_name asc, s.product_id
  limit v_limit offset v_offset;
end $$;

-- ===== grants =====
revoke all on function public.analytics_product_totals(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.analytics_stock_flags(uuid) from public, anon, authenticated;
revoke all on function public.analytics_product_performance(uuid, date, date, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.analytics_attention(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.analytics_stock_watch(uuid, text, integer, integer) from public, anon, authenticated;

grant execute on function public.analytics_product_performance(uuid, date, date, text, integer, integer, text) to authenticated;
grant execute on function public.analytics_attention(uuid, date, date, text) to authenticated;
grant execute on function public.analytics_stock_watch(uuid, text, integer, integer) to authenticated;