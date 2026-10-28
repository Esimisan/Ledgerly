import { supabase } from "../lib/supabase";

export function listCategories(businessId) {
  return supabase
    .from("categories")
    .select("id, name, is_active")
    .eq("business_id", businessId)
    .order("name");
}

export function createCategory(businessId, name) {
  return supabase
    .from("categories")
    .insert({ business_id: businessId, name })
    .select("id, name, is_active")
    .single();
}

export function updateCategory(id, businessId, patch) {
  return supabase
    .from("categories")
    .update(patch)
    .eq("id", id)
    .eq("business_id", businessId);
}

export function categoryError(err) {
  if (err?.code === "23505") return "A category with that name already exists.";
  if (err?.code === "42501")
    return "You do not have permission to change categories.";
  return err?.message || "Something went wrong. Please try again.";
}
