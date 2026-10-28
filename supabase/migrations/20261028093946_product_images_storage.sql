-- Product images: private bucket, access tied to business membership and permissions.

-- 1) Bucket: private, 2 MB cap, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Helper: the first folder of an object path must be a business uuid.
--    Returns NULL for anything else, so malformed paths are simply denied instead of raising errors.
create or replace function public.storage_business_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;

revoke all on function public.storage_business_id(text) from public, anon;
grant execute on function public.storage_business_id(text) to authenticated;

-- 3) Policies on storage.objects, scoped to this bucket only.
--    Read: any active member of the business. Write/delete: needs products.write (owner passes).
create policy "product images: members can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_member(public.storage_business_id(name))
  );

create policy "product images: writers can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_permission(public.storage_business_id(name), 'products.write')
  );

create policy "product images: writers can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_permission(public.storage_business_id(name), 'products.write')
  );