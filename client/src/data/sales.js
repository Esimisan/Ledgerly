import { supabase } from "../lib/supabase";
import { PAGE_SIZE } from "./products";

// ---------- constants shared by the screens ----------
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "pos", label: "POS" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "other", label: "Other" },
];

export const REFUND_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "store_credit", label: "Store credit" },
  { value: "other", label: "Other" },
];

export const RETURN_CONDITIONS = [
  { value: "resellable", label: "Resellable (back on the shelf)" },
  { value: "damaged", label: "Damaged (not restocked)" },
];

export const SALE_SORTS = {
  newest: { label: "Newest first", column: "sold_at", ascending: false },
  oldest: { label: "Oldest first", column: "sold_at", ascending: true },
  total_desc: { label: "Largest total", column: "total", ascending: false },
  total_asc: { label: "Smallest total", column: "total", ascending: true },
  owed_desc: {
    label: "Most owed",
    column: "amount_outstanding",
    ascending: false,
  },
};

// Lighter column set for the list; the detail page reads everything.
const SALE_LIST_COLUMNS =
  "id, sale_number, sale_label, customer_id, customer_name, status, sold_at, total, amount_paid, amount_outstanding, payment_method, item_count, return_count, refunded_total";

// Same guard as the customers list: these characters break PostgREST's or(...).
const cleanTerm = (s) => s.replace(/[%_,()\\*]/g, " ").trim();

// ---------- date helpers (the date inputs give "YYYY-MM-DD") ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function dayStart(value) {
  if (!DATE_RE.test(value ?? "")) return null;
  const d = new Date(`${value}T00:00:00`); // local midnight
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- reads ----------
export async function listSales({
  businessId,
  q = "",
  status = "all",
  from = "",
  to = "",
  customerId = "",
  unpaid = false,
  sort = "newest",
  page = 1,
  pageSize = PAGE_SIZE,
}) {
  let query = supabase
    .from("sales_with_details")
    .select(SALE_LIST_COLUMNS, { count: "exact" })
    .eq("business_id", businessId);

  if (status === "completed" || status === "voided")
    query = query.eq("status", status);

  const start = dayStart(from);
  if (start) query = query.gte("sold_at", start.toISOString());
  const end = dayStart(to);
  if (end) {
    end.setDate(end.getDate() + 1); // "to" is inclusive: stop before the next day
    query = query.lt("sold_at", end.toISOString());
  }

  if (customerId === "walkin") query = query.is("customer_id", null);
  else if (customerId) query = query.eq("customer_id", customerId);

  if (unpaid) query = query.gt("amount_outstanding", 0);

  const term = cleanTerm(q);
  if (term)
    query = query.or(
      `sale_label.ilike.%${term}%,customer_name.ilike.%${term}%`,
    );

  const { column, ascending } = SALE_SORTS[sort] ?? SALE_SORTS.newest;
  const rangeFrom = (page - 1) * pageSize;
  const { data, count, error } = await query
    .order(column, { ascending })
    .order("id") // tiebreaker so pages never overlap
    .range(rangeFrom, rangeFrom + pageSize - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

export function getSale(businessId, id) {
  return supabase
    .from("sales_with_details")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
}

// Read from the table (not a product view) so deleted products still show.
export async function listSaleItems(businessId, saleId) {
  const { data, error } = await supabase
    .from("sale_items")
    .select(
      "id, product_id, product_name, product_sku, quantity, unit_price, unit_cost, discount_amount, line_total, returned_quantity",
    )
    .eq("business_id", businessId)
    .eq("sale_id", saleId)
    .order("created_at")
    .order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

export async function listSalePayments(businessId, saleId) {
  const { data, error } = await supabase
    .from("sale_payments")
    .select("id, amount, method, paid_at, reference")
    .eq("business_id", businessId)
    .eq("sale_id", saleId)
    .order("paid_at")
    .order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

export async function listSaleReturns(businessId, saleId) {
  const { data, error } = await supabase
    .from("sale_returns_with_details")
    .select("*")
    .eq("business_id", businessId)
    .eq("sale_id", saleId)
    .order("returned_at", { ascending: false })
    .order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

// Lines of several returns at once. Names come from the sale's own items
// (matched on sale_item_id), because return lines only store ids.
export async function listReturnItems(businessId, returnIds) {
  if (!returnIds.length) return { rows: [], error: "" };
  const { data, error } = await supabase
    .from("sale_return_items")
    .select(
      "id, sale_return_id, sale_item_id, quantity, refund_unit_amount, condition, line_total, restocked",
    )
    .eq("business_id", businessId)
    .in("sale_return_id", returnIds)
    .order("created_at")
    .order("id");
  return { rows: data ?? [], error: error?.message ?? "" };
}

// Products the till can offer. Only active ones; deleted products are hidden by
// the view itself.
export async function searchSellableProducts({
  businessId,
  q = "",
  limit = 10,
}) {
  let query = supabase
    .from("products_with_status")
    .select(
      "id, name, sku, barcode, unit, selling_price, quantity_on_hand, min_stock_level, image_path, stock_status",
    )
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
const toItems = (items) =>
  items.map((i) => ({ product_id: i.productId, quantity: Number(i.quantity) }));

const toPayments = (payments) =>
  payments.map((p) => ({
    method: p.method,
    amount: Number(p.amount),
    reference: (p.reference ?? "").trim() || null,
  }));

// manual = { type: "percent" | "fixed", value } or null
const manualArgs = (manual) => ({
  p_manual_discount_type: manual?.type || null,
  p_manual_discount_value: manual ? Number(manual.value) : null,
});

// Live preview: the server prices the cart, nothing is saved.
export function quoteSale({
  businessId,
  customerId,
  items,
  promoCode,
  manual,
}) {
  return supabase.rpc("quote_sale", {
    p_business_id: businessId,
    p_customer_id: customerId || null,
    p_items: toItems(items),
    p_promo_code: (promoCode ?? "").trim() || null,
    ...manualArgs(manual),
  });
}

export function createSale({
  businessId,
  customerId,
  items,
  payments,
  promoCode,
  manual,
  notes,
}) {
  return supabase.rpc("create_sale", {
    p_business_id: businessId,
    p_customer_id: customerId || null,
    p_items: toItems(items),
    p_payments: toPayments(payments),
    p_promo_code: (promoCode ?? "").trim() || null,
    ...manualArgs(manual),
    p_notes: (notes ?? "").trim() || null,
  });
}

export function voidSale({ businessId, saleId, reason }) {
  return supabase.rpc("void_sale", {
    p_business_id: businessId,
    p_sale_id: saleId,
    p_reason: (reason ?? "").trim(),
  });
}

// items: [{ saleItemId, quantity, condition }]. refundMethod can be null when the
// whole refund only cancels debt on the sale.
export function createReturn({
  businessId,
  saleId,
  items,
  refundMethod,
  reason,
}) {
  return supabase.rpc("create_return", {
    p_business_id: businessId,
    p_sale_id: saleId,
    p_items: items.map((i) => ({
      sale_item_id: i.saleItemId,
      quantity: Number(i.quantity),
      condition: i.condition || "resellable",
    })),
    p_refund_method: refundMethod || null,
    p_reason: (reason ?? "").trim() || null,
  });
}

// Messages the functions raise on purpose are already readable, so show them as they are. Anything raw from the database or the network becomes a friendly line.
export function saleError(err) {
  const msg = err?.message || "";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Could not reach the server. Check your connection and try again.";
  if (err?.code === "42501" && /permission denied/i.test(msg))
    return "You do not have permission to do this.";
  return msg || "Something went wrong. Please try again.";
}
