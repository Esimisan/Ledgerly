import { supabase } from "../lib/supabase";
import { PAGE_SIZE } from "./products";

// Labels and badge colours for each movement type.
export const MOVEMENT_TYPES = {
  opening_stock: { label: "Opening stock", tone: "success" },
  purchase: { label: "Stock added", tone: "success" },
  sale: { label: "Sold", tone: "accent" },
  sale_return: { label: "Returned", tone: "success" },
  removal: { label: "Removed", tone: "warning" },
  damage: { label: "Damaged", tone: "danger" },
  adjustment: { label: "Adjusted", tone: "accent" },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateParam = (s) => DATE.test(s ?? "");

// A picked day means the whole day in the browser's own time zone.
function dayBound(day, end) {
  if (!isDateParam(day)) return null;
  const d = new Date(`${day}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Characters that would break PostgREST's or(...) syntax or act as wildcards.
const cleanTerm = (s) => s.replace(/[%_,()\\*]/g, " ").trim();

export async function listMovements({
  businessId,
  productId = "",
  q = "",
  type = "",
  from = "",
  to = "",
  page = 1,
}) {
  let query = supabase
    .from("stock_movements_with_details")
    .select("*", { count: "exact" })
    .eq("business_id", businessId);

  if (productId) query = query.eq("product_id", productId);
  if (MOVEMENT_TYPES[type]) query = query.eq("movement_type", type);

  const term = cleanTerm(q);
  if (term)
    query = query.or(
      `product_name.ilike.%${term}%,product_sku.ilike.%${term}%`,
    );

  const start = dayBound(from, false);
  const end = dayBound(to, true);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lte("created_at", end);

  const offset = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id") // stable ordering so pages never overlap
    .range(offset, offset + PAGE_SIZE - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

// Counts for the All / Low / Out chips (active products only).
export async function getStockSummary(businessId) {
  const base = () =>
    supabase
      .from("products_with_status")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_active", true);
  const [all, low, out] = await Promise.all([
    base(),
    base().eq("stock_status", "low"),
    base().eq("stock_status", "out"),
  ]);
  return { all: all.count ?? 0, low: low.count ?? 0, out: out.count ?? 0 };
}

// Reads the products TABLE, so a deleted product's name still resolves.
export function getProductName(businessId, productId) {
  return supabase
    .from("products")
    .select("name")
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
}

// Opening stock is only allowed before any other movement exists.
export function countProductMovements(businessId, productId) {
  return supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("product_id", productId);
}

export function recordStockMovement({
  businessId,
  productId,
  type,
  quantity,
  unitCost = null,
  note = null,
}) {
  return supabase.rpc("record_stock_movement", {
    p_business_id: businessId,
    p_product_id: productId,
    p_type: type,
    p_quantity: quantity,
    p_unit_cost: unitCost,
    p_note: note,
  });
}

export function adjustStock({ businessId, productId, counted, note }) {
  return supabase.rpc("adjust_stock", {
    p_business_id: businessId,
    p_product_id: productId,
    p_counted_quantity: counted,
    p_note: note,
  });
}

// The database functions raise readable messages (code P0001), so those are shown as they are.
export function stockError(err) {
  if (err?.code === "42501")
    return "You do not have permission to change stock.";
  if (err?.code === "23514") return "That would take stock below zero.";
  return err?.message || "Could not save the stock change. Please try again.";
}
