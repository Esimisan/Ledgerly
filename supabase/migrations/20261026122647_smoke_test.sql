create table public.app_health (
  id int primary key,
  note text not null
);

alter table public.app_health enable row level security;

grant select on public.app_health to anon, authenticated;

create policy "anyone can read health"
  on public.app_health for select
  to anon, authenticated
  using (true);

insert into public.app_health (id, note) values (1, 'Ledgerly is alive');