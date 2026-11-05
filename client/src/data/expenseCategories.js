import { supabase } from "../lib/supabase";
import { PAGE_SIZE } from "./products";

export const CATEGORY_STATUSES = ["active", "inactive", "all"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "id, name, is_system, is_active, created_at";

// Management list: paginated, with a status filter.
export async function listExpenseCategories({
  businessId,
  status = "active",
  page = 1,
}) {
  let query = supabase
    .from("expense_categories")
    .select(COLUMNS, { count: "exact" })
    .eq("business_id", businessId);

  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("name")
    .order("id") // tiebreaker so pages never overlap
    .range(from, from + PAGE_SIZE - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

// Dropdown: every active category, plus (when editing) the expense's current
// category even if it has since been deactivated.
export async function listCategoryOptions(businessId, includeId = "") {
  let query = supabase
    .from("expense_categories")
    .select("id, name, is_active")
    .eq("business_id", businessId);

  query = UUID.test(includeId)
    ? query.or(`is_active.eq.true,id.eq.${includeId}`)
    : query.eq("is_active", true);

  const { data, error } = await query.order("name").order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

export function createCategory(businessId, name) {
  return supabase
    .from("expense_categories")
    .insert({ business_id: businessId, name: name.trim() })
    .select("id")
    .single();
}

// RLS hides rows you may not update, and then Supabase reports "success, 0 rows".
async function updateRow(id, businessId, patch) {
  const { data, error } = await supabase
    .from("expense_categories")
    .update(patch)
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id");
  if (!error && (!data || data.length === 0))
    return { error: { code: "42501", message: "Not permitted" } };
  return { error };
}

export const renameCategory = (id, businessId, name) =>
  updateRow(id, businessId, { name: name.trim() });

export const setCategoryActive = (id, businessId, isActive) =>
  updateRow(id, businessId, { is_active: isActive });

export function categoryError(err) {
  const msg = err?.message || "";
  if (err?.code === "23505")
    return "A category with this name already exists. It may be deactivated, so check the Inactive filter.";
  if (err?.code === "23514") {
    if (msg.includes("name_length"))
      return "Category names can be at most 60 characters.";
    return "The category name cannot be empty.";
  }
  if (err?.code === "42501" || /row-level security/i.test(msg))
    return "You do not have permission to change expense categories.";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Could not reach the server. Check your connection and try again.";
  return msg || "Something went wrong. Please try again.";
}
