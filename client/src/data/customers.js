import { supabase } from "../lib/supabase";
import { PAGE_SIZE } from "./products";

export const CUSTOMER_COLUMNS =
  "id, name, phone, email, address, notes, discount_percent, balance, total_orders, total_spent, last_purchase_at, is_active, created_at";

export const CUSTOMER_SORTS = {
  name: { label: "Name (A–Z)", column: "name", ascending: true },
  newest: { label: "Newest first", column: "created_at", ascending: false },
  last_purchase: {
    label: "Last purchase",
    column: "last_purchase_at",
    ascending: false,
    nullsFirst: false, // customers who never bought go last
  },
  balance_desc: {
    label: "Balance: highest owed",
    column: "balance",
    ascending: false,
  },
  spent_desc: { label: "Most spent", column: "total_spent", ascending: false },
};

// Characters that would break PostgREST's or(...) syntax or act as wildcards.
const cleanTerm = (s) => s.replace(/[%_,()\\*]/g, " ").trim();

export async function listCustomers({
  businessId,
  q = "",
  status = "active",
  balance = "",
  sort = "name",
  page = 1,
}) {
  let query = supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS, { count: "exact" })
    .eq("business_id", businessId);

  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);
  if (balance === "owes") query = query.gt("balance", 0);
  if (balance === "credit") query = query.lt("balance", 0);

  const term = cleanTerm(q);
  if (term)
    query = query.or(
      `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
    );

  const { column, ascending, nullsFirst } =
    CUSTOMER_SORTS[sort] ?? CUSTOMER_SORTS.name;
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

export function getCustomer(businessId, id) {
  return supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
}

// Trim text; empty optional fields are stored as NULL, never "".
const clean = (value) => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

// discount_percent is only sent when the user may set it. The database refuses
// it for everyone else anyway; leaving it out keeps staff edits simple.
const toRow = (f, withDiscount) => ({
  name: f.name.trim(),
  phone: clean(f.phone),
  email: clean(f.email),
  address: clean(f.address),
  notes: clean(f.notes),
  ...(withDiscount
    ? { discount_percent: Number(f.discount_percent || 0) }
    : {}),
});

export function createCustomer(businessId, fields, withDiscount) {
  return supabase
    .from("customers")
    .insert({ business_id: businessId, ...toRow(fields, withDiscount) })
    .select("id")
    .single();
}

// RLS hides rows you may not update, and Supabase then reports "success, 0 rows".
async function updateRow(id, businessId, patch) {
  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id");
  if (!error && (!data || data.length === 0))
    return { error: { code: "42501", message: "Not permitted" } };
  return { error };
}

export const updateCustomer = (id, businessId, fields, withDiscount) =>
  updateRow(id, businessId, toRow(fields, withDiscount));

export const setCustomerActive = (id, businessId, isActive) =>
  updateRow(id, businessId, { is_active: isActive });

// Returns { field, message }. "field" says which form input the message belongs
// to ("" = show it in the banner).
export function customerError(err) {
  const msg = err?.message || "";
  if (err?.code === "23505") {
    if (msg.includes("phone"))
      return {
        field: "phone",
        message:
          "Another customer already uses this phone number. They may be deactivated, so check the Inactive filter.",
      };
    if (msg.includes("email"))
      return {
        field: "email",
        message:
          "Another customer already uses this email. They may be deactivated, so check the Inactive filter.",
      };
  }
  if (err?.code === "23514") {
    if (msg.includes("phone"))
      return {
        field: "phone",
        message: "Enter a phone number with at least one digit.",
      };
    if (msg.includes("email"))
      return { field: "email", message: "Enter a valid email address." };
    if (msg.includes("name"))
      return { field: "name", message: "Enter the customer's name." };
    if (msg.includes("lengths"))
      return { field: "", message: "One of the fields is too long." };
  }
  if (err?.code === "42501") {
    if (/discount level/i.test(msg))
      return { field: "discount_percent", message: msg };
    return {
      field: "",
      message: "You do not have permission to change customers.",
    };
  }
  return {
    field: "",
    message: msg || "Something went wrong. Please try again.",
  };
}

// Labels and badge colours for ledger rows.
export const LEDGER_TYPES = {
  credit_sale: { label: "Credit sale", tone: "warning" },
  payment: { label: "Payment", tone: "success" },
  return_credit: { label: "Return credit", tone: "success" },
  adjustment: { label: "Adjustment", tone: "accent" },
};

// One customer's debt/credit history, newest first. The view reads profiles for
// the recorder's name, and RLS limits it to businesses you belong to.
export async function listLedger({ businessId, customerId, page = 1 }) {
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("customer_transactions_with_details")
    .select("*", { count: "exact" })
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .order("id") // tiebreaker so pages never overlap
    .range(from, from + PAGE_SIZE - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}
