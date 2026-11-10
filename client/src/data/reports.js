import { supabase } from "../lib/supabase";
import { toApiRange } from "../lib/reportRange";
import { PAGE_SIZE } from "./products";

export const REPORT_TZ = "Africa/Lagos";

// Messages the database raises on purpose are already readable, so they pass through.
export function reportError(err) {
  const msg = err?.message || "";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Could not reach the server. Check your connection and try again.";
  if (err?.code === "42501" && /permission denied for function/i.test(msg))
    return "You do not have permission to view this report.";
  return msg || "Something went wrong. Please try again.";
}

async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: reportError(error) };
  return { data, error: "" };
}

// List functions return rows with total_count (and grand totals) repeated on each row.
function listResult(res, totalsOf) {
  if (res.error) return res;
  const rows = res.data ?? [];
  return {
    data: {
      rows,
      total: Number(rows[0]?.total_count ?? 0),
      totals: rows[0] ? totalsOf(rows[0]) : null,
    },
    error: "",
  };
}

// Adapter for the CSV exporter: { rows, total, error }.
export function toPage(res) {
  if (res.error) return { rows: [], total: 0, error: res.error };
  return { rows: res.data.rows, total: res.data.total, error: "" };
}

const offsetOf = (page, pageSize) => (page - 1) * pageSize;

// ---------- sort keys ("column:direction"), also the values in the URL ----------
export const REPORT_PRODUCT_SORTS = {
  "revenue:desc": {
    sort: "revenue",
    dir: "desc",
    label: "Revenue: high to low",
  },
  "revenue:asc": { sort: "revenue", dir: "asc", label: "Revenue: low to high" },
  "units:desc": { sort: "units", dir: "desc", label: "Units sold: most first" },
  "units:asc": { sort: "units", dir: "asc", label: "Units sold: fewest first" },
  "name:asc": { sort: "name", dir: "asc", label: "Name (A–Z)" },
  "name:desc": { sort: "name", dir: "desc", label: "Name (Z–A)" },
  "profit:desc": {
    sort: "profit",
    dir: "desc",
    label: "Gross profit: high to low",
    finance: true,
  },
  "profit:asc": {
    sort: "profit",
    dir: "asc",
    label: "Gross profit: low to high",
    finance: true,
  },
  "margin:desc": {
    sort: "margin",
    dir: "desc",
    label: "Margin: high to low",
    finance: true,
  },
  "margin:asc": {
    sort: "margin",
    dir: "asc",
    label: "Margin: low to high",
    finance: true,
  },
};

export const REPORT_CUSTOMER_SORTS = {
  "spent:desc": { sort: "spent", dir: "desc", label: "Net spent: high to low" },
  "spent:asc": { sort: "spent", dir: "asc", label: "Net spent: low to high" },
  "orders:desc": { sort: "orders", dir: "desc", label: "Orders: most first" },
  "orders:asc": { sort: "orders", dir: "asc", label: "Orders: fewest first" },
  "name:asc": { sort: "name", dir: "asc", label: "Name (A–Z)" },
  "name:desc": { sort: "name", dir: "desc", label: "Name (Z–A)" },
  "last_purchase:desc": {
    sort: "last_purchase",
    dir: "desc",
    label: "Last purchase: newest",
  },
  "last_purchase:asc": {
    sort: "last_purchase",
    dir: "asc",
    label: "Last purchase: oldest",
  },
};

export const BALANCE_SORTS = {
  "balance:desc": {
    sort: "balance",
    dir: "desc",
    label: "Balance: highest first",
  },
  "balance:asc": {
    sort: "balance",
    dir: "asc",
    label: "Balance: lowest first",
  },
  "name:asc": { sort: "name", dir: "asc", label: "Name (A–Z)" },
  "name:desc": { sort: "name", dir: "desc", label: "Name (Z–A)" },
  "last_purchase:desc": {
    sort: "last_purchase",
    dir: "desc",
    label: "Last purchase: newest",
  },
  "last_purchase:asc": {
    sort: "last_purchase",
    dir: "asc",
    label: "Last purchase: oldest",
  },
};

// ---------- reports ----------
export function getSalesSummary({ businessId, from, to, granularity }) {
  const { apiFrom, apiTo } = toApiRange(from, to);
  return call("report_sales_summary", {
    p_business_id: businessId,
    p_from: apiFrom,
    p_to: apiTo,
    p_granularity: granularity,
    p_tz: REPORT_TZ,
  });
}

export async function listSalesByProduct({
  businessId,
  from,
  to,
  search = "",
  sort = "revenue:desc",
  page = 1,
  pageSize = PAGE_SIZE,
}) {
  const { apiFrom, apiTo } = toApiRange(from, to);
  const s = REPORT_PRODUCT_SORTS[sort] ?? REPORT_PRODUCT_SORTS["revenue:desc"];
  const res = await call("report_sales_by_product", {
    p_business_id: businessId,
    p_from: apiFrom,
    p_to: apiTo,
    p_search: search.trim() || null,
    p_sort: s.sort,
    p_dir: s.dir,
    p_limit: pageSize,
    p_offset: offsetOf(page, pageSize),
    p_tz: REPORT_TZ,
  });
  return listResult(res, (r) => ({
    units: r.total_units,
    revenue: r.total_revenue,
    cogs: r.total_cogs,
    grossProfit: r.total_gross_profit,
  }));
}

export async function listSalesByCustomer({
  businessId,
  from,
  to,
  search = "",
  sort = "spent:desc",
  page = 1,
  pageSize = PAGE_SIZE,
}) {
  const { apiFrom, apiTo } = toApiRange(from, to);
  const s = REPORT_CUSTOMER_SORTS[sort] ?? REPORT_CUSTOMER_SORTS["spent:desc"];
  const res = await call("report_sales_by_customer", {
    p_business_id: businessId,
    p_from: apiFrom,
    p_to: apiTo,
    p_search: search.trim() || null,
    p_sort: s.sort,
    p_dir: s.dir,
    p_limit: pageSize,
    p_offset: offsetOf(page, pageSize),
    p_tz: REPORT_TZ,
  });
  return listResult(res, (r) => ({
    orders: r.total_orders,
    gross: r.total_gross,
    refunds: r.total_refunds,
    net: r.total_net,
  }));
}

export function getProfitAndLoss({ businessId, from, to }) {
  const { apiFrom, apiTo } = toApiRange(from, to);
  return call("report_profit_and_loss", {
    p_business_id: businessId,
    p_from: apiFrom,
    p_to: apiTo,
    p_tz: REPORT_TZ,
  });
}

export async function getExpensesByCategory({ businessId, from, to }) {
  const { apiFrom, apiTo } = toApiRange(from, to);
  const res = await call("report_expenses_by_category", {
    p_business_id: businessId,
    p_from: apiFrom,
    p_to: apiTo,
  });
  if (res.error) return res;
  const rows = res.data ?? [];
  return {
    data: {
      rows,
      grandTotal: Number(rows[0]?.grand_total ?? 0),
      grandCount: Number(rows[0]?.grand_count ?? 0),
    },
    error: "",
  };
}

export async function listInventoryMovements({
  businessId,
  from,
  to,
  search = "",
  page = 1,
  pageSize = PAGE_SIZE,
}) {
  const { apiFrom, apiTo } = toApiRange(from, to);
  const res = await call("report_inventory_movements", {
    p_business_id: businessId,
    p_from: apiFrom,
    p_to: apiTo,
    p_search: search.trim() || null,
    p_limit: pageSize,
    p_offset: offsetOf(page, pageSize),
    p_tz: REPORT_TZ,
  });
  return listResult(res, () => null);
}

// A snapshot as of now: no dates.
export async function listCustomerBalances({
  businessId,
  status = "owing",
  search = "",
  sort = "balance:desc",
  page = 1,
  pageSize = PAGE_SIZE,
}) {
  const s = BALANCE_SORTS[sort] ?? BALANCE_SORTS["balance:desc"];
  const res = await call("report_customer_balances", {
    p_business_id: businessId,
    p_status: status,
    p_search: search.trim() || null,
    p_sort: s.sort,
    p_dir: s.dir,
    p_limit: pageSize,
    p_offset: offsetOf(page, pageSize),
  });
  return listResult(res, (r) => ({
    owed: r.total_owed,
    credit: r.total_credit,
  }));
}

export function getPeriodSummary({ businessId, mode, year }) {
  return call("report_period_summary", {
    p_business_id: businessId,
    p_mode: mode,
    p_year: year,
    p_tz: REPORT_TZ,
  });
}
