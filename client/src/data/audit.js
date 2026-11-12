import { supabase } from "../lib/supabase";
import { PAGE_SIZE } from "./products";

export const AUDIT_AREAS = [
  "Staff",
  "Permissions",
  "Settings",
  "Sales",
  "Products",
  "Expenses",
  "Customers",
  "Stock",
  "Backups",
];

const fail = (error) =>
  error?.message || "Something went wrong. Please try again.";

// RPC messages are written to be read by people, so they are shown as they are.
export async function listAuditLog({
  businessId,
  from,
  to,
  actor,
  area,
  page,
  pageSize = PAGE_SIZE,
}) {
  const { data, error } = await supabase.rpc("list_audit_log", {
    p_business_id: businessId,
    p_from: from || null,
    p_to: to || null,
    p_actor: actor || null,
    p_area: area || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) return { rows: [], total: 0, error: fail(error) };
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error: "" };
}

export async function listAuditActors(businessId) {
  const { data, error } = await supabase.rpc("audit_actor_options", {
    p_business_id: businessId,
  });
  return { data: error ? null : (data ?? []), error: error ? fail(error) : "" };
}
