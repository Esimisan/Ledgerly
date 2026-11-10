import { supabase } from "../lib/supabase";

// Messages the functions raise on purpose are already readable, so they pass through.
export function importError(err) {
  const msg = err?.message || "";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Could not reach the server. Check your connection and try again.";
  if (err?.code === "42501" && /permission denied for function/i.test(msg))
    return "You do not have permission to import products.";
  return msg || "Something went wrong. Please try again.";
}

// Dry run: nothing is written. Returns { data: { total_rows, counts, rows, new_categories, ... } }.
export async function validateProductImport({ businessId, rows }) {
  const { data, error } = await supabase.rpc("validate_product_import", {
    p_business_id: businessId,
    p_rows: rows,
  });
  return error
    ? { data: null, error: importError(error) }
    : { data, error: "" };
}

// One transaction. skipInvalid: import only the valid rows when some rows have errors.
export async function importProducts({
  businessId,
  fileName,
  rows,
  skipInvalid,
}) {
  const { data, error } = await supabase.rpc("import_products", {
    p_business_id: businessId,
    p_file_name: fileName,
    p_rows: rows,
    p_options: { skip_invalid: Boolean(skipInvalid) },
  });
  return error
    ? { data: null, error: importError(error) }
    : { data, error: "" };
}

export async function listImportJobs(businessId, limit = 8) {
  const { data, error } = await supabase
    .from("import_jobs")
    .select(
      "id, file_name, status, total_rows, succeeded_rows, failed_rows, created_at",
    )
    .eq("business_id", businessId)
    .eq("kind", "products")
    .order("created_at", { ascending: false })
    .limit(limit);
  return { rows: data ?? [], error: error?.message ?? "" };
}

// Pages through the live catalogue for "Download current products". Category and supplier names
// are looked up once. Deleted products are left out. Returns { rows, total, error }.
export function makeProductExportFetcher(businessId) {
  let names = null;
  return async function fetchPage(page, pageSize) {
    if (!names) {
      const [cats, sups] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("business_id", businessId),
        supabase
          .from("suppliers")
          .select("id, name")
          .eq("business_id", businessId),
      ]);
      const failure = cats.error || sups.error;
      if (failure) return { rows: [], total: 0, error: importError(failure) };
      names = {
        cat: new Map((cats.data ?? []).map((c) => [c.id, c.name])),
        sup: new Map((sups.data ?? []).map((s) => [s.id, s.name])),
      };
    }
    const from = (page - 1) * pageSize;
    const { data, count, error } = await supabase
      .from("products")
      .select(
        "name, sku, barcode, description, unit, cost_price, selling_price, min_stock_level, category_id, supplier_id",
        { count: "exact" },
      )
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name")
      .order("id") // tiebreaker so pages never overlap
      .range(from, from + pageSize - 1);
    if (error) return { rows: [], total: 0, error: importError(error) };
    return {
      rows: (data ?? []).map((p) => ({
        ...p,
        category: p.category_id ? (names.cat.get(p.category_id) ?? "") : "",
        supplier: p.supplier_id ? (names.sup.get(p.supplier_id) ?? "") : "",
      })),
      total: count ?? 0,
      error: "",
    };
  };
}
