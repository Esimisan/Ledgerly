import { supabase } from "../lib/supabase";
import { PAGE_SIZE } from "./products";

const COLUMNS =
  "id, name, contact_name, phone, email, address, notes, is_active, created_at";

// Used by the product form's dropdown (unchanged).
export function listSupplierOptions(businessId) {
  return supabase
    .from("suppliers")
    .select("id, name, is_active")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
}

// Characters that would break a PostgREST .or() filter or act as LIKE wildcards.
const cleanSearch = (q) => q.replace(/[%_\\,()*]/g, " ").trim();

export async function listSuppliers({
  businessId,
  q = "",
  status = "active",
  page = 1,
}) {
  let query = supabase
    .from("suppliers")
    .select(COLUMNS, { count: "exact" })
    .eq("business_id", businessId);

  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);

  const term = cleanSearch(q);
  if (term)
    query = query.or(
      `name.ilike.%${term}%,contact_name.ilike.%${term}%,phone.ilike.%${term}%`,
    );

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("name")
    .range(from, from + PAGE_SIZE - 1);

  if (error) return { rows: [], total: 0, error: error.message };
  return { rows: data ?? [], total: count ?? 0, error: "" };
}

// Trim text; empty optional fields are stored as NULL, not "".
const clean = (value) => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

const toRow = (f) => ({
  name: f.name.trim(),
  contact_name: clean(f.contact_name),
  phone: clean(f.phone),
  email: clean(f.email),
  address: clean(f.address),
  notes: clean(f.notes),
});

export function createSupplier(businessId, fields) {
  return supabase
    .from("suppliers")
    .insert({ business_id: businessId, ...toRow(fields) })
    .select("id")
    .single();
}

// RLS hides rows you may not update, and then Supabase reports "success, 0 rows".

async function updateRow(id, businessId, patch) {
  const { data, error } = await supabase
    .from("suppliers")
    .update(patch)
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id");
  if (!error && (!data || data.length === 0))
    return { error: { code: "42501", message: "Not permitted" } };
  return { error };
}

export const updateSupplier = (id, businessId, fields) =>
  updateRow(id, businessId, toRow(fields));

export const setSupplierActive = (id, businessId, isActive) =>
  updateRow(id, businessId, { is_active: isActive });

// How many (non-deleted) products use this supplier. products_with_status hides deleted ones.
export function countSupplierProducts(supplierId, businessId) {
  return supabase
    .from("products_with_status")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("supplier_id", supplierId);
}

export function supplierError(err) {
  if (err?.code === "23505")
    return "A supplier with this name already exists. It may be deactivated, so check the Inactive filter.";
  if (err?.code === "23514") return "The supplier name cannot be empty.";
  if (err?.code === "42501")
    return "You do not have permission to change suppliers.";
  return err?.message || "Something went wrong. Please try again.";
}
