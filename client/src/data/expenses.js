import { supabase } from "../lib/supabase";
import { deleteReceipt, uploadReceipt } from "../lib/receipts";
import { toCents } from "../lib/saleInput";
import { PAGE_SIZE } from "./products";

export const EXPENSE_STATUSES = ["active", "voided", "all"];

export const EXPENSE_SORTS = {
  newest: { label: "Newest first", column: "expense_date", ascending: false },
  oldest: { label: "Oldest first", column: "expense_date", ascending: true },
  amount_desc: { label: "Largest amount", column: "amount", ascending: false },
  amount_asc: { label: "Smallest amount", column: "amount", ascending: true },
};

const LIST_COLUMNS =
  "id, category_id, category_name, category_is_active, amount, expense_date, description, vendor, payment_method, receipt_path, created_by_name, created_at, voided_at, voided_by_name, void_reason, is_voided";

// Characters that would break PostgREST's or(...) syntax or act as wildcards.
const cleanTerm = (s) => s.replace(/[%_,()\\*]/g, " ").trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v) => DATE_RE.test(v ?? "") && !Number.isNaN(Date.parse(v));

// ---------- date helpers (local time, "YYYY-MM-DD") ----------
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayLocal = () => iso(new Date());

// "2026-11-01" -> "2026-10-31". Turns PeriodContext's exclusive end into an inclusive one.
export function dayBefore(value) {
  const [y, m, d] = value.split("-").map(Number);
  return iso(new Date(y, m - 1, d - 1));
}

// status: "active" (default) | "voided" | "all". Dates are inclusive.
export async function listExpenses({
  businessId,
  q = "",
  categoryId = "",
  status = "active",
  from = "",
  to = "",
  sort = "newest",
  page = 1,
  pageSize = PAGE_SIZE,
}) {
  let query = supabase
    .from("expenses_with_details")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("business_id", businessId);

  if (status === "active") query = query.is("voided_at", null);
  if (status === "voided") query = query.not("voided_at", "is", null);
  if (UUID.test(categoryId)) query = query.eq("category_id", categoryId);
  if (validDate(from)) query = query.gte("expense_date", from);
  if (validDate(to)) query = query.lte("expense_date", to);

  const term = cleanTerm(q);
  if (term)
    query = query.or(
      `description.ilike.%${term}%,vendor.ilike.%${term}%,category_name.ilike.%${term}%`,
    );

  const { column, ascending } = EXPENSE_SORTS[sort] ?? EXPENSE_SORTS.newest;
  const rangeFrom = (page - 1) * pageSize;
  const { data, count, error } = await query
    .order(column, { ascending })
    .order("created_at", { ascending: false })
    .order("id") // tiebreaker so pages never overlap
    .range(rangeFrom, rangeFrom + pageSize - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

// Totals by category for non-voided expenses. Empty from/to means no limit on
// that side; both ends are inclusive. Step 11 will reuse the database function.
export async function expenseTotals({ businessId, from = "", to = "" }) {
  const { data, error } = await supabase.rpc("expense_totals_by_category", {
    p_business_id: businessId,
    p_from: validDate(from) ? from : null,
    p_to: validDate(to) ? to : null,
  });
  if (error) return { rows: [], grand: 0, count: 0, error: error.message };

  const rows = (data ?? []).map((r) => ({
    categoryId: r.category_id,
    name: r.category_name,
    total: Number(r.total),
    count: Number(r.expense_count),
  }));
  const cents = rows.reduce((sum, r) => sum + toCents(r.total), 0); // whole kobo
  return {
    rows,
    grand: cents / 100,
    count: rows.reduce((sum, r) => sum + r.count, 0),
    error: "",
  };
}

// Trim text; empty optional fields are stored as NULL, not "".
const clean = (value) => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

const toRow = (f) => ({
  category_id: f.category_id,
  amount: Number(f.amount),
  expense_date: f.expense_date,
  description: clean(f.description),
  vendor: clean(f.vendor),
  payment_method: f.payment_method || null,
});

// Same order as saveProduct: upload the new receipt, save the row, then remove the replaced file. If the save fails, the new upload is removed again.

// newReceipt = { blob, ext } from prepareReceipt, or null.
export async function saveExpense({
  businessId,
  id,
  fields,
  newReceipt,
  removeReceipt,
  previousPath,
}) {
  let uploadedPath = null;
  try {
    if (newReceipt)
      uploadedPath = await uploadReceipt(
        businessId,
        newReceipt.blob,
        newReceipt.ext,
      );
    const receipt_path = newReceipt
      ? uploadedPath
      : removeReceipt
        ? null
        : (previousPath ?? null);
    const payload = { ...toRow(fields), receipt_path };

    let savedId;
    if (id) {
      const { data, error } = await supabase
        .from("expenses")
        .update(payload)
        .eq("id", id)
        .eq("business_id", businessId)
        .select("id");
      if (error) throw error;
      // RLS hides rows you may not update; Supabase then reports "success, 0 rows".
      if (!data || data.length === 0)
        throw { code: "42501", message: "Not permitted" };
      savedId = data[0].id;
    } else {
      const { data, error } = await supabase
        .from("expenses")
        .insert({ ...payload, business_id: businessId })
        .select("id")
        .single();
      if (error) throw error;
      savedId = data.id;
    }

    if (previousPath && previousPath !== receipt_path) {
      await deleteReceipt(previousPath).catch(() => {}); // best effort
    }
    return savedId;
  } catch (err) {
    if (uploadedPath) await deleteReceipt(uploadedPath).catch(() => {});
    throw err;
  }
}

// The only way to void: the database stamps who and when.
export function voidExpense({ businessId, expenseId, reason }) {
  return supabase.rpc("void_expense", {
    p_business_id: businessId,
    p_expense_id: expenseId,
    p_reason: (reason ?? "").trim(),
  });
}

// Messages the database raises on purpose are already readable ("Choose an active category...", "This expense has been voided..."), so they pass through unchanged.
export function expenseError(err) {
  const msg = err?.message || "";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Could not reach the server. Check your connection and try again.";
  if (err?.code === "23514") {
    if (msg.includes("amount_check"))
      return "The amount must be greater than zero.";
    if (msg.includes("description_length"))
      return "The description can be at most 500 characters.";
    if (msg.includes("vendor_length"))
      return "The vendor name can be at most 120 characters.";
    if (msg.includes("receipt_path"))
      return "The receipt could not be attached. Upload it again.";
    return "Some of these details are not valid. Please check and try again.";
  }
  if (err?.code === "23503")
    return "That category no longer exists. Reload the page and try again.";
  if (err?.code === "22003") return "That amount is too large.";
  if (
    err?.code === "42501" ||
    /row-level security|violates row-level/i.test(msg)
  )
    return "You do not have permission to do that.";
  // Storage errors carry an HTTP status instead of a Postgres code.
  if (String(err?.statusCode) === "413" || /exceeded the maximum/i.test(msg))
    return "That receipt file is too large. Choose one under 5 MB.";
  return msg || "Something went wrong. Please try again.";
}

// "2026-03-10" -> "Mar 10, 2026". Reads the date as local time (formatDate would
// treat it as UTC midnight and can show the day before).
export function formatExpenseDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en", {
    dateStyle: "medium",
  });
}
