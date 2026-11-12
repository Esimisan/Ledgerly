-- Step 15: per-user "I have seen / skipped this tutorial" state.
-- Keyed by user (not business) so it follows the person across browsers and devices.
create table public.tour_progress (
  user_id  uuid not null references auth.users (id) on delete cascade,
  tour_key text not null,
  seen_at  timestamptz not null default now(),
  primary key (user_id, tour_key),
  constraint tour_progress_key_format
    check (tour_key ~ '^[a-z][a-z0-9-]{0,63}$')
);

alter table public.tour_progress enable row level security;

-- Explicit grants: authenticated only; no update; clients cannot set seen_at.
revoke all on public.tour_progress from public, anon, authenticated;
grant select, delete on public.tour_progress to authenticated;
grant insert (user_id, tour_key) on public.tour_progress to authenticated;

create policy tour_progress_select_own on public.tour_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy tour_progress_insert_own on public.tour_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy tour_progress_delete_own on public.tour_progress
  for delete to authenticated
  using (user_id = (select auth.uid()));