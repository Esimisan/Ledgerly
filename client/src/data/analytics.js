import { supabase } from "../lib/supabase";

// How many days without a purchase counts as "lapsed" (the database default; shown in the UI text).
export const LAPSED_DAYS = 60;

function friendly(message = "") {
  return /failed to fetch|networkerror|load failed/i.test(message)
    ? "Could not reach the server. Check your connection and try again."
    : message;
}

async function call(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { data: null, error: friendly(error.message) };
    return { data, error: "" };
  } catch (e) {
    return { data: null, error: friendly(e?.message) };
  }
}

async function listCall(name, args) {
  const res = await call(name, args);
  if (res.error) return res;
  const rows = res.data ?? [];
  return {
    data: { rows, total: Number(rows[0]?.total_count ?? 0) },
    error: "",
  };
}

// All dates are "YYYY-MM-DD"; `to` is EXCLUSIVE (the same convention as PeriodContext). No timezone is sent: the database defaults to Africa/Lagos.

export const getKpis = ({ businessId, from, to }) =>
  call("analytics_kpis", { p_business_id: businessId, p_from: from, p_to: to });

export const getSalesSeries = ({ businessId, from, to, granularity }) =>
  call("analytics_sales_series", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
    p_granularity: granularity,
  });

export const getAttention = ({ businessId, from, to }) =>
  call("analytics_attention", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
  });

export const getProductPerformance = ({
  businessId,
  from,
  to,
  rank,
  limit = 10,
  offset = 0,
}) =>
  listCall("analytics_product_performance", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
    p_rank: rank,
    p_limit: limit,
    p_offset: offset,
  });

export const getStockWatch = ({ businessId, kind, limit = 20, offset = 0 }) =>
  listCall("analytics_stock_watch", {
    p_business_id: businessId,
    p_kind: kind,
    p_limit: limit,
    p_offset: offset,
  });

export const getCustomerSnapshot = ({ businessId, from, to }) =>
  call("analytics_customer_snapshot", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
  });

export const getCustomerRankings = ({
  businessId,
  from,
  to,
  rank,
  limit = 10,
  offset = 0,
}) =>
  listCall("analytics_customer_rankings", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
    p_rank: rank,
    p_limit: limit,
    p_offset: offset,
  });

export const getTrendSeries = ({ businessId, from, to, granularity }) =>
  call("analytics_trend_series", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
    p_granularity: granularity,
  });
