-- 1. Suppliers are never hard-deleted (deactivate with is_active instead).
--    Removing the policy AND the grant means both layers say no.
drop policy if exists suppliers_delete on public.suppliers;
revoke delete, truncate, references, trigger on public.suppliers from authenticated;

-- 2. Replace the table-level insert/update grants with column-level ones,
--    so id, created_at and updated_at can never be written by a client.
--    (business_id is insertable but never updatable: a trigger also blocks changing it.)
revoke insert, update on public.suppliers from authenticated;

grant insert (business_id, name, contact_name, phone, email, address, notes, is_active)
  on public.suppliers to authenticated;

grant update (name, contact_name, phone, email, address, notes, is_active)
  on public.suppliers to authenticated;

-- 3. One supplier name per business, ignoring case and surrounding spaces.
--    Includes inactive suppliers, so a deactivated one is reactivated, not duplicated.
create unique index suppliers_business_name_unique
  on public.suppliers (business_id, lower(btrim(name)));