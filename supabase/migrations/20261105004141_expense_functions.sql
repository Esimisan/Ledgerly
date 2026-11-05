
-- void_expense: the only way to void an expense

create function public.void_expense(
  p_business_id uuid,
  p_expense_id  uuid,
  p_reason      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_expense record;
begin
  if not public.has_permission(p_business_id, 'expenses.manage') then
    raise exception 'You do not have permission to void expenses' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Give a reason for voiding this expense';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason can be at most 500 characters';
  end if;

  select e.id, e.amount, e.voided_at
    into v_expense
    from public.expenses e
   where e.id = p_expense_id and e.business_id = p_business_id
     for update;

  if not found then
    raise exception 'Expense not found in this business';
  end if;
  if v_expense.voided_at is not null then
    raise exception 'This expense is already voided';
  end if;

  update public.expenses
     set voided_at   = now(),
         voided_by   = auth.uid(),
         void_reason = v_reason
   where id = p_expense_id and business_id = p_business_id;

  return jsonb_build_object(
    'expense_id', p_expense_id,
    'amount',     v_expense.amount
  );
end;
$$;

revoke all on function public.void_expense(uuid, uuid, text) from public, anon;
grant execute on function public.void_expense(uuid, uuid, text) to authenticated;


-- expense_totals_by_category: non-voided totals for a date range
-- (both dates inclusive; NULL means no limit on that side)

create function public.expense_totals_by_category(
  p_business_id uuid,
  p_from        date,
  p_to          date
)
returns table (
  category_id    uuid,
  category_name  text,
  total          numeric,
  expense_count  bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id,
         c.name,
         sum(e.amount),
         count(*)
    from public.expenses e
    join public.expense_categories c
      on c.business_id = e.business_id and c.id = e.category_id
   where e.business_id = p_business_id
     and e.voided_at is null
     and (p_from is null or e.expense_date >= p_from)
     and (p_to   is null or e.expense_date <= p_to)
   group by c.id, c.name
   order by sum(e.amount) desc, c.name;
$$;

revoke all on function public.expense_totals_by_category(uuid, date, date) from public, anon;
grant execute on function public.expense_totals_by_category(uuid, date, date) to authenticated;