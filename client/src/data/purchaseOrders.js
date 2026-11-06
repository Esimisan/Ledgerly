import { supabase } from "../lib/supabase";
import { isDateParam } from "./stock";
import { PAGE_SIZE } from "./products";

export const PO_STATUS = {
  draft: { label: "Draft", tone: "accent" },
  ordered: { label: "Ordered", tone: "warning" },
  partially_received: { label: "Partly received", tone: "warning" },
  received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const PO_STATUS_FILTERS = [
  ["all", "All orders"],
  ["open", "Open (not finished)"],
  ["draft", "Draft"],
  ["ordered", "Ordered"],
  ["partially_received", "Partly received"],
  ["received", "Received"],
  ["cancelled", "Cancelled"],
];

export const PO_SORTS = {
  newest: { label: "Newest first", column: "created_at", ascending: false },
  oldest: { label: "Oldest first", column: "created_at", ascending: true },
  total_desc: { label: "Largest total", column: "total", ascending: false },
  expected: {
    label: "Expected soonest",
    column: "expected_date",
    ascending: true,
    nullsFirst: false, // orders with no date go last
  },
};

const OPEN = ["draft", "ordered", "partially_received"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Characters that would break PostgREST's or(...) syntax or act as wildcards.
const cleanTerm = (s) => s.replace(/[%_,()\\*]/g, " ").trim();

// A picked day means the whole day in the browser's own time zone.
function dayBound(day, end) {
  if (!isDateParam(day)) return null;
  const d = new Date(`${day}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function listPurchaseOrders({
  businessId,
  q = "",
  status = "all",
  supplierId = "",
  from = "",
  to = "",
  sort = "newest",
  page = 1,
}) {
  let query = supabase
    .from("purchase_orders_with_details")
    .select("*", { count: "exact" })
    .eq("business_id", businessId);

  if (status === "open") query = query.in("status", OPEN);
  else if (PO_STATUS[status]) query = query.eq("status", status);
  if (UUID.test(supplierId)) query = query.eq("supplier_id", supplierId);

  const start = dayBound(from, false);
  const end = dayBound(to, true);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lte("created_at", end);

  const term = cleanTerm(q);
  if (term)
    query = query.or(`po_label.ilike.%${term}%,supplier_name.ilike.%${term}%`);

  const { column, ascending, nullsFirst } = PO_SORTS[sort] ?? PO_SORTS.newest;
  const offset = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order(column, {
      ascending,
      ...(nullsFirst === undefined ? {} : { nullsFirst }),
    })
    .order("id") // tiebreaker so pages never overlap
    .range(offset, offset + PAGE_SIZE - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

export function getPurchaseOrder(businessId, id) {
  return supabase
    .from("purchase_orders_with_details")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
}

export async function listPoItems(businessId, poId) {
  const { data, error } = await supabase
    .from("purchase_order_items_with_details")
    .select("*")
    .eq("business_id", businessId)
    .eq("purchase_order_id", poId)
    .order("created_at")
    .order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

export async function listPoReceipts(businessId, poId) {
  const { data, error } = await supabase
    .from("purchase_receipts_with_details")
    .select("*")
    .eq("business_id", businessId)
    .eq("purchase_order_id", poId)
    .order("received_at", { ascending: false })
    .order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

// Lines of several deliveries at once; names come from the order's own lines.
export async function listReceiptLines(businessId, receiptIds) {
  if (!receiptIds.length) return { rows: [], error: "" };
  const { data, error } = await supabase
    .from("purchase_receipt_items")
    .select(
      "id, purchase_receipt_id, purchase_order_item_id, product_id, quantity, unit_cost, line_total",
    )
    .eq("business_id", businessId)
    .in("purchase_receipt_id", receiptIds)
    .order("created_at")
    .order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

// Filter dropdown: every supplier, including inactive ones (old orders keep them).
export async function listSupplierFilterOptions(businessId) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, is_active")
    .eq("business_id", businessId)
    .order("name")
    .order("id")
    .limit(200);
  return { rows: data ?? [], error: error?.message ?? "" };
}

// Products you can order: every active product, in stock or not.
export async function searchPoProducts({ businessId, q = "", limit = 10 }) {
  let query = supabase
    .from("products_with_status")
    .select("id, name, sku, unit, cost_price, quantity_on_hand, image_path")
    .eq("business_id", businessId)
    .eq("is_active", true);

  const term = cleanTerm(q);
  if (term)
    query = query.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`,
    );

  const { data, error } = await query.order("name").order("id").limit(limit);
  return { rows: data ?? [], error: error?.message ?? "" };
}

// ---------- the four database functions ----------
// lines: [{ productId, quantity, unitCost }]. id = null creates; an id edits a draft.
export function savePurchaseOrder({
  businessId,
  id = null,
  supplierId,
  lines,
  expectedDate,
  shippingCost,
  notes,
  place = false,
}) {
  return supabase.rpc("save_purchase_order", {
    p_business_id: businessId,
    p_purchase_order_id: id,
    p_supplier_id: supplierId,
    p_items: lines.map((l) => ({
      product_id: l.productId,
      quantity: Number(l.quantity),
      unit_cost: Number(l.unitCost),
    })),
    p_expected_date: expectedDate || null,
    p_shipping_cost: Number(shippingCost || 0),
    p_notes: (notes ?? "").trim() || null,
    p_place: place,
  });
}

export function placePurchaseOrder({ businessId, poId }) {
  return supabase.rpc("place_purchase_order", {
    p_business_id: businessId,
    p_purchase_order_id: poId,
  });
}

// lines: [{ itemId, quantity, unitCost }]
export function receivePurchaseOrder({
  businessId,
  poId,
  lines,
  reference,
  note,
  updateCost,
}) {
  return supabase.rpc("receive_purchase_order", {
    p_business_id: businessId,
    p_purchase_order_id: poId,
    p_lines: lines.map((l) => ({
      item_id: l.itemId,
      quantity: Number(l.quantity),
      unit_cost: Number(l.unitCost),
    })),
    p_reference: (reference ?? "").trim() || null,
    p_note: (note ?? "").trim() || null,
    p_update_cost: Boolean(updateCost),
  });
}

export function cancelPurchaseOrder({ businessId, poId, reason }) {
  return supabase.rpc("cancel_purchase_order", {
    p_business_id: businessId,
    p_purchase_order_id: poId,
    p_reason: (reason ?? "").trim(),
  });
}

// Messages the functions raise on purpose are already readable, so they pass through.
export function poError(err) {
  const msg = err?.message || "";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Could not reach the server. Check your connection and try again.";
  if (err?.code === "22003") return "One of the amounts is too large.";
  if (err?.code === "42501")
    return "You do not have permission to manage purchase orders.";
  return msg || "Something went wrong. Please try again.";
}
