import { supabase } from "../lib/supabase";

export function listSupplierOptions(businessId) {
  return supabase
    .from("suppliers")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
}
