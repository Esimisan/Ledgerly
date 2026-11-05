insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts', 'expense-receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "expense receipts: viewers can read"    on storage.objects;
drop policy if exists "expense receipts: managers can upload" on storage.objects;
drop policy if exists "expense receipts: managers can delete" on storage.objects;

create policy "expense receipts: viewers can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'expense-receipts'
    and public.has_permission(public.storage_business_id(name), 'finance.view')
  );

create policy "expense receipts: managers can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and public.has_permission(public.storage_business_id(name), 'expenses.manage')
  );

create policy "expense receipts: managers can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'expense-receipts'
    and public.has_permission(public.storage_business_id(name), 'expenses.manage')
  );