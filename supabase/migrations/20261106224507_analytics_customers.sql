-- ===== public: customer snapshot strip =====
create or replace function public.analytics_customer_snapshot(
  p_business_id uuid, p_from date, p_to date, p_tz text default 'Africa/Lagos')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_t0 timestamptz; v_t1 timestamptz;
  v_active bigint; v_new bigint; v_buyers bigint; v_returning bigint; v_owing bigint; v_owed numeric;
begin
  perform public.analytics_access(p_business_id);
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'The end date must be after the start date.' using errcode = '22023';
  end if;
  v_t0 := p_from::timestamp at time zone p_tz;
  v_t1 := p_to::timestamp at time zone p_tz;

  select count(*) into v_active
  from public.customers c where c.business_id = p_business_id and c.is_active;

  select count(*) into v_new
  from public.customers c
  where c.business_id = p_business_id and c.created_at >= v_t0 and c.created_at < v_t1;

  -- Identified buyers in the period; returning = they already had a completed sale before it.
  with buyers as (
    select distinct s.customer_id
    from public.sales s
    where s.business_id = p_business_id and s.status = 'completed' and s.customer_id is not null
      and s.sold_at >= v_t0 and s.sold_at < v_t1
  )
  select count(*),
         count(*) filter (where exists (
           select 1 from public.sales e
           where e.business_id = p_business_id and e.customer_id = buyers.customer_id
             and e.status = 'completed' and e.sold_at < v_t0))
  into v_buyers, v_returning
  from buyers;

  select count(*), coalesce(sum(c.balance), 0) into v_owing, v_owed
  from public.customers c where c.business_id = p_business_id and c.balance > 0;

  return jsonb_build_object(
    'total_active', v_active,
    'new_in_period', v_new,
    'buyers', v_buyers,
    'returning_buyers', v_returning,
    'returning_pct', case when v_buyers > 0 then round(v_returning::numeric / v_buyers * 100, 0) end,
    'customers_owing', v_owing,
    'total_owed', v_owed,
    'period', jsonb_build_object('from', p_from, 'to', p_to));
end $$;

-- ===== public: customer rankings =====
-- p_rank: top_spending | most_frequent | lapsed | new
-- spent_in_period = completed sales minus refunds in the period; lapsed ignores the period.
create or replace function public.analytics_customer_rankings(
  p_business_id uuid, p_from date, p_to date,
  p_rank text default 'top_spending',
  p_limit integer default 10, p_offset integer default 0,
  p_lapsed_days integer default 60, p_tz text default 'Africa/Lagos')
returns table (
  rank_no bigint, customer_id uuid, customer_name text, phone text,
  orders_in_period bigint, spent_in_period numeric,
  lifetime_orders bigint, lifetime_spent numeric,
  last_purchase_at timestamptz, days_since_last integer, balance numeric,
  joined_at timestamptz, is_new boolean, is_returning boolean, total_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_t0 timestamptz; v_t1 timestamptz;
  v_limit integer; v_offset integer; v_days integer;
begin
  perform public.analytics_access(p_business_id);
  if p_rank is null or p_rank not in ('top_spending', 'most_frequent', 'lapsed', 'new') then
    raise exception 'Unknown customer ranking.' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'The end date must be after the start date.' using errcode = '22023';
  end if;
  v_t0 := p_from::timestamp at time zone p_tz;
  v_t1 := p_to::timestamp at time zone p_tz;
  v_limit := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset := greatest(0, coalesce(p_offset, 0));
  v_days := greatest(1, least(coalesce(p_lapsed_days, 60), 3650));

  return query
  with per as (
    select s.customer_id as cid, count(*) as n, sum(s.total) as gross
    from public.sales s
    where s.business_id = p_business_id and s.status = 'completed' and s.customer_id is not null
      and s.sold_at >= v_t0 and s.sold_at < v_t1
    group by s.customer_id
  ),
  refs as (
    select r.customer_id as cid, sum(r.refund_total) as refunded
    from public.sale_returns r
    where r.business_id = p_business_id and r.customer_id is not null
      and r.returned_at >= v_t0 and r.returned_at < v_t1
    group by r.customer_id
  ),
  base as (
    select c.id as cid, c.name::text as cname, c.phone::text as cphone,
           coalesce(per.n, 0) as n,
           coalesce(per.gross, 0) - coalesce(rf.refunded, 0) as spent,
           c.total_orders::bigint as lorders, c.total_spent::numeric as lspent,
           c.last_purchase_at as lastp, c.balance::numeric as bal, c.created_at as joined,
           (c.created_at >= v_t0 and c.created_at < v_t1) as isnew,
           (per.n is not null and exists (
              select 1 from public.sales e
              where e.business_id = p_business_id and e.customer_id = c.id
                and e.status = 'completed' and e.sold_at < v_t0)) as isret,
           c.is_active as act
    from public.customers c
    left join per on per.cid = c.id
    left join refs rf on rf.cid = c.id
    where c.business_id = p_business_id
  ),
  kept as (
    select b.* from base b
    where (p_rank in ('top_spending', 'most_frequent') and b.n > 0)
       or (p_rank = 'lapsed' and b.act and b.lastp is not null
           and b.lastp < now() - make_interval(days => v_days))
       or (p_rank = 'new' and b.isnew)
  ),
  ranked as (
    select k.*,
           row_number() over (order by
             case when p_rank = 'top_spending' then k.spent end desc,
             case when p_rank = 'most_frequent' then k.n end desc,
             case when p_rank = 'lapsed' then k.lspent end desc,
             case when p_rank = 'new' then k.joined end desc,
             k.spent desc, k.cname asc, k.cid) as rn,
           count(*) over () as cnt
    from kept k
  )
  select r.rn, r.cid, r.cname, r.cphone, r.n, r.spent, r.lorders, r.lspent, r.lastp,
         case when r.lastp is null then null
              else floor(extract(epoch from now() - r.lastp) / 86400)::integer end,
         r.bal, r.joined, r.isnew, r.isret, r.cnt
  from ranked r
  order by r.rn
  limit v_limit offset v_offset;
end $$;

revoke all on function public.analytics_customer_snapshot(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.analytics_customer_rankings(uuid, date, date, text, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.analytics_customer_snapshot(uuid, date, date, text) to authenticated;
grant execute on function public.analytics_customer_rankings(uuid, date, date, text, integer, integer, integer, text) to authenticated;