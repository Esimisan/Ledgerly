-- anon never gets anything in the public schema.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- authenticated keeps only the grants each migration gave it explicitly.
-- Remove the leftovers that Supabase's defaults added. TRUNCATE ignores RLS.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- MAINTAIN exists only on Postgres 17+. Revoke it only where the server knows it.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
  end if;
end;
$$;

-- Helper function that should not be callable through the API.
-- Triggers still work, because EXECUTE is only checked when a trigger is created.
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Future objects created by postgres in public get no automatic access for these roles.
alter default privileges for role postgres in schema public
  revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;