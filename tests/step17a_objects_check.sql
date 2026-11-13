with fns(sig) as (
  values ('public.cost_gate_product(uuid,uuid)'), ('public.po_cost_gate_product(uuid,uuid)'),
         ('public.cost_gate_sale(uuid,uuid)'), ('public.cost_gate_movement(uuid,uuid)'),
         ('public.get_product_costs(uuid,uuid[])'), ('public.get_sale_costs(uuid,uuid[])')
),
chk(ord, name, ok) as (
  select 10, 'exec authenticated only: ' || sig,
         coalesce(has_function_privilege('authenticated', to_regprocedure(sig), 'execute'), false)
         and not coalesce(has_function_privilege('anon', to_regprocedure(sig), 'execute'), true)
  from fns
  union all
  select 20, 'definer + search_path on the 6 new functions',
         (select count(*) from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('cost_gate_product','po_cost_gate_product','cost_gate_sale',
                               'cost_gate_movement','get_product_costs','get_sale_costs')
             and p.prosecdef and p.proconfig::text ilike '%search_path%') = 6
  union all
  select 30, 'hidden from clients: ' || t || '.' || col,
         not has_column_privilege('authenticated', 'public.' || t, col, 'select')
  from (values ('products','cost_price'), ('sales','cost_total'),
               ('sale_items','unit_cost'), ('stock_movements','unit_cost')) x(t, col)
  union all
  select 40, 'still readable: ' || t || '.' || col,
         has_column_privilege('authenticated', 'public.' || t, col, 'select')
  from (values ('products','selling_price'), ('sales','total'),
               ('sale_items','unit_price'), ('stock_movements','quantity_change')) x(t, col)
  union all
  select 50, 'still writable: products.cost_price (' || pr || ')',
         has_column_privilege('authenticated', 'public.products', 'cost_price', pr)
  from (values ('insert'), ('update')) x(pr)
  union all
  select 60, 'view ' || v || ': invoker, authenticated only, uses ' || g,
         coalesce((select coalesce(k.reloptions::text, '') ilike '%security_invoker=true%'
                     and has_table_privilege('authenticated', k.oid, 'select')
                     and not has_table_privilege('anon', k.oid, 'select')
                     and pg_get_viewdef(k.oid) like '%' || g || '%'
                   from pg_class k
                   where k.relnamespace = 'public'::regnamespace and k.relname = v), false)
  from (values ('products_with_status', 'cost_gate_product'),
               ('sales_with_details', 'cost_gate_sale'),
               ('stock_movements_with_details', 'cost_gate_movement'),
               ('purchase_order_items_with_details', 'po_cost_gate_product')) x(v, g)
  union all
  select 70, 'no function executable by anon/public',
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and has_function_privilege('anon', p.oid, 'execute'))
  union all
  select 71, 'trigger helpers closed to authenticated',
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and p.proname in ('rls_auto_enable', 'prevent_business_id_change')
                       and has_function_privilege('authenticated', p.oid, 'execute'))
  union all
  select 72, 'every definer function sets search_path',
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and p.prosecdef and coalesce(p.proconfig::text, '') not ilike '%search_path%')
  union all
  select 73, 'RLS enabled on every public table',
         not exists (select 1 from pg_class k where k.relnamespace = 'public'::regnamespace
                       and k.relkind = 'r' and not k.relrowsecurity)
  union all
  select 74, 'anon has no privilege on any public table or view',
         not exists (select 1 from pg_class k where k.relnamespace = 'public'::regnamespace
                       and k.relkind in ('r', 'v', 'm', 'p')
                       and has_table_privilege('anon', k.oid,
                           'select, insert, update, delete, truncate, references, trigger'))
  union all
  select 75, 'categories: no DELETE for clients',
         not has_table_privilege('authenticated', 'public.categories', 'delete')
  union all
  select 76, 'categories: business_id not updatable',
         not has_column_privilege('authenticated', 'public.categories', 'business_id', 'update')
  union all
  select 77, 'categories: name updatable',
         has_column_privilege('authenticated', 'public.categories', 'name', 'update')
  union all
  select 78, 'invitations: no client access',
         not has_any_column_privilege('authenticated', 'public.invitations',
                                      'select, insert, update, references')
         and not has_table_privilege('authenticated', 'public.invitations', 'delete')
)
select check_name, result from (
  select ord, name as check_name,
         case when coalesce(ok, false) then 'OK' else 'WRONG' end as result
  from chk
  union all
  select 999, 'wrong_count', (count(*) filter (where not coalesce(ok, false)))::text from chk
) z
order by ord, check_name;