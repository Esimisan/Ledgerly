-- Private buckets for the business logo and personal avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Avatars live in a folder named after the user. A user sees their own and those of
-- people in the same business. Takes the folder as text so a bad name can never error.
create or replace function public.avatar_visible(p_folder text)
returns boolean language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_other uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_folder = auth.uid()::text then return true; end if;
  if p_folder is null
     or p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_other := p_folder::uuid;
  return exists (
    select 1
      from public.business_members a
      join public.business_members b on b.business_id = a.business_id
     where a.user_id = auth.uid() and a.status = 'active'
       and b.user_id = v_other and b.status = 'active');
end
$fn$;

revoke all on function public.avatar_visible(text) from public, anon, authenticated;
grant execute on function public.avatar_visible(text) to authenticated;

-- Logos: path <business_id>/<file>. Members read, settings managers write.
drop policy if exists "logos: members can read" on storage.objects;
create policy "logos: members can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and public.is_member(public.storage_business_id(name)));

drop policy if exists "logos: settings managers can upload" on storage.objects;
create policy "logos: settings managers can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos'
    and public.has_permission(public.storage_business_id(name), 'settings.manage'));

drop policy if exists "logos: settings managers can delete" on storage.objects;
create policy "logos: settings managers can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos'
    and public.has_permission(public.storage_business_id(name), 'settings.manage'));

-- Avatars: path <user_id>/<file>
drop policy if exists "avatars: co-members can read" on storage.objects;
create policy "avatars: co-members can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.avatar_visible((storage.foldername(name))[1]));

drop policy if exists "avatars: owner can upload" on storage.objects;
create policy "avatars: owner can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: owner can delete" on storage.objects;
create policy "avatars: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Business settings are written straight from the browser, so check them here.
-- Only changed fields are checked, so old rows never block unrelated updates.
create or replace function public.validate_business_settings()
returns trigger language plpgsql set search_path = ''
as $fn$
begin
  if new.name is distinct from old.name then
    new.name := btrim(new.name);
    if new.name is null or char_length(new.name) = 0 then
      raise exception 'Business name is required.' using errcode = '22023';
    end if;
    if char_length(new.name) > 120 then
      raise exception 'Business name must be 120 characters or fewer.' using errcode = '22023';
    end if;
  end if;

  if new.timezone is distinct from old.timezone
     and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
  end if;

  if new.currency_code is distinct from old.currency_code then
    new.currency_code := upper(btrim(new.currency_code));
    if new.currency_code is null or new.currency_code !~ '^[A-Z]{3}$' then
      raise exception 'Currency code must be three capital letters, like NGN.' using errcode = '22023';
    end if;
  end if;

  if new.currency_symbol is distinct from old.currency_symbol then
    new.currency_symbol := btrim(new.currency_symbol);
    if new.currency_symbol is null or char_length(new.currency_symbol) not between 1 and 5 then
      raise exception 'Currency symbol must be 1 to 5 characters.' using errcode = '22023';
    end if;
  end if;

  if new.default_tax_rate is distinct from old.default_tax_rate
     and (new.default_tax_rate is null or new.default_tax_rate < 0 or new.default_tax_rate > 100) then
    raise exception 'Tax rate must be between 0 and 100.' using errcode = '22023';
  end if;

  if new.low_stock_default is distinct from old.low_stock_default
     and (new.low_stock_default is null or new.low_stock_default < 0) then
    raise exception 'The low-stock default cannot be negative.' using errcode = '22023';
  end if;

  if new.email is distinct from old.email then
    new.email := btrim(new.email);
    if new.email is not null and new.email <> ''
       and new.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Enter a valid email address.' using errcode = '22023';
    end if;
  end if;

  if new.phone is distinct from old.phone then
    new.phone := nullif(btrim(new.phone), '');
    if char_length(new.phone) > 40 then
      raise exception 'Phone number must be 40 characters or fewer.' using errcode = '22023';
    end if;
  end if;

  if new.address is distinct from old.address then
    new.address := btrim(new.address);
    if char_length(new.address) > 300 then
      raise exception 'Address must be 300 characters or fewer.' using errcode = '22023';
    end if;
  end if;

  if new.receipt_footer is distinct from old.receipt_footer then
    new.receipt_footer := btrim(new.receipt_footer);
    if char_length(new.receipt_footer) > 300 then
      raise exception 'The receipt footer must be 300 characters or fewer.' using errcode = '22023';
    end if;
  end if;

  return new;
end
$fn$;

drop trigger if exists businesses_validate on public.businesses;
create trigger businesses_validate
  before update on public.businesses
  for each row execute function public.validate_business_settings();

revoke all on function public.validate_business_settings() from public, anon, authenticated;