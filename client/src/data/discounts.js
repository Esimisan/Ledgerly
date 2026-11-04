import { supabase } from "../lib/supabase";
import { PAGE_SIZE } from "./products";

export const DISCOUNT_COLUMNS =
  "id, name, code, discount_type, value, min_order_amount, starts_at, ends_at, usage_limit, times_used, is_active, created_at";

export const DISCOUNT_SORTS = {
  newest: { label: "Newest first", column: "created_at", ascending: false },
  name: { label: "Name (A–Z)", column: "name", ascending: true },
  most_used: { label: "Most used", column: "times_used", ascending: false },
  ends_soon: {
    label: "Ending soonest",
    column: "ends_at",
    ascending: true,
    nullsFirst: false, // promos with no end date go last
  },
};

const cleanTerm = (s) => s.replace(/[%_,()\\*]/g, " ").trim();

// Derived from the row, the same order the database checks a code in.
// tone is a badge suffix: "success" | "warning" | "danger" | "" (accent).
export function discountStatus(d, now = new Date()) {
  if (!d.is_active) return { key: "off", label: "Off", tone: "warning" };
  if (d.starts_at && new Date(d.starts_at) > now)
    return { key: "scheduled", label: "Scheduled", tone: "" };
  if (d.ends_at && new Date(d.ends_at) <= now)
    return { key: "expired", label: "Expired", tone: "danger" };
  if (d.usage_limit != null && d.times_used >= d.usage_limit)
    return { key: "used_up", label: "Used up", tone: "danger" };
  return { key: "active", label: "Active", tone: "success" };
}

// ISO timestamp -> the "YYYY-MM-DDTHH:mm" text a datetime-local input wants (local time).
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function listDiscounts({
  businessId,
  q = "",
  status = "active",
  sort = "newest",
  page = 1,
}) {
  let query = supabase
    .from("discounts")
    .select(DISCOUNT_COLUMNS, { count: "exact" })
    .eq("business_id", businessId);

  if (status === "active") query = query.eq("is_active", true);
  if (status === "off") query = query.eq("is_active", false);

  const term = cleanTerm(q);
  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);

  const { column, ascending, nullsFirst } =
    DISCOUNT_SORTS[sort] ?? DISCOUNT_SORTS.newest;
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order(column, {
      ascending,
      ...(nullsFirst === undefined ? {} : { nullsFirst }),
    })
    .order("id") // tiebreaker so pages never overlap
    .range(from, from + PAGE_SIZE - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

const clean = (value) => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};
const toIso = (v) => (v ? new Date(v).toISOString() : null);

// Codes are stored in capitals. The database treats them as case-insensitive
// anyway, so "save10" and "SAVE10" can never both exist.
const toRow = (f) => ({
  name: f.name.trim(),
  code: clean(f.code)?.toUpperCase() ?? null,
  discount_type: f.discount_type,
  value: Number(f.value),
  min_order_amount: Number(f.min_order_amount || 0),
  starts_at: toIso(f.starts_at),
  ends_at: toIso(f.ends_at),
  usage_limit:
    f.usage_limit === "" || f.usage_limit == null
      ? null
      : Number(f.usage_limit),
});

export function createDiscount(businessId, fields) {
  return supabase
    .from("discounts")
    .insert({ business_id: businessId, ...toRow(fields) })
    .select("id")
    .single();
}

// RLS hides rows you may not update and Supabase then reports "success, 0 rows".
async function updateRow(id, businessId, patch) {
  const { data, error } = await supabase
    .from("discounts")
    .update(patch)
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id");
  if (!error && (!data || data.length === 0))
    return { error: { code: "42501", message: "Not permitted" } };
  return { error };
}

export const updateDiscount = (id, businessId, fields) =>
  updateRow(id, businessId, toRow(fields));

export const setDiscountActive = (id, businessId, isActive) =>
  updateRow(id, businessId, { is_active: isActive });

// Returns { field, message }; "" means show it in the banner.
export function discountError(err) {
  const msg = err?.message || "";
  if (err?.code === "23505")
    return {
      field: "code",
      message:
        "Another promo code already uses this code (codes are not case-sensitive). It may be turned off, so check the Off filter.",
    };
  if (err?.code === "23514") {
    // "discounts_check1" must be tested before "discounts_check".
    if (msg.includes('"discounts_check1"'))
      return { field: "ends_at", message: "The end must be after the start." };
    if (msg.includes('"discounts_check"'))
      return {
        field: "value",
        message: "A percentage discount cannot be more than 100.",
      };
    if (msg.includes("discounts_value_check"))
      return { field: "value", message: "Enter a value greater than zero." };
    if (msg.includes("discounts_min_order_amount_check"))
      return {
        field: "min_order_amount",
        message: "The minimum order cannot be negative.",
      };
    if (msg.includes("discounts_usage_limit_check"))
      return {
        field: "usage_limit",
        message: "The usage limit must be at least 1, or left empty.",
      };
    if (msg.includes("discounts_name_check"))
      return { field: "name", message: "Enter a name for this promo." };
  }
  if (err?.code === "22003")
    return { field: "", message: "One of the numbers is too large." };
  if (err?.code === "42501")
    return {
      field: "",
      message: "You do not have permission to change promo codes.",
    };
  return {
    field: "",
    message: msg || "Something went wrong. Please try again.",
  };
}
