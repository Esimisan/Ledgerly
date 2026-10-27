create table public.customer_transactions (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  customer_id    uuid not null,
  txn_type       public.customer_txn_type not null,
  -- Signed: positive = customer owes more, negative = customer owes less
  amount         numeric(14,2) not null check (amount <> 0),
  balance_after  numeric(14,2) not null,          -- filled by the trigger below
  sale_id        uuid,
  sale_return_id uuid,
  payment_method public.payment_method,
  note           text,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (business_id, id),
  constraint customer_txn_sign_matches_type check (
    (txn_type = 'credit_sale' and amount > 0)
    or (txn_type in ('payment', 'return_credit') and amount < 0)
    or txn_type = 'adjustment'
  ),
  foreign key (business_id, customer_id)    references public.customers (business_id, id),
  foreign key (business_id, sale_id)        references public.sales (business_id, id),
  foreign key (business_id, sale_return_id) references public.sale_returns (business_id, id)
);
create index customer_txn_customer_idx
  on public.customer_transactions (business_id, customer_id, created_at desc);
alter table public.customer_transactions enable row level security;
grant select on public.customer_transactions to authenticated;  -- writes via RPC

create or replace function public.apply_customer_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.customers
     set balance = balance + new.amount
   where id = new.customer_id
     and business_id = new.business_id
  returning balance into new.balance_after;

  if not found then
    raise exception 'Customer % not found in this business', new.customer_id;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_customer_transaction() from public, anon, authenticated;

create trigger customer_transactions_apply
  before insert on public.customer_transactions
  for each row execute function public.apply_customer_transaction();