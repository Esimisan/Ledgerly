import { supabase } from "../lib/supabase";

// My memberships in every status. The SQL function filters by auth.uid(), so there is no business id to pass.
export async function listMyBusinesses() {
  const { data, error } = await supabase.rpc("my_businesses");
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((r) => ({
      businessId: r.business_id,
      name: r.name,
      logoPath: r.logo_path,
      role: r.role,
      status: r.status,
    })),
    error: "",
  };
}

// The id here IS the business id (the table's primary key).
export async function fetchBusinessRow(businessId) {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  return { data: data ?? null, error: error?.message ?? "" };
}

// Permissions of one role in ONE business. Never merged with another business.
export async function fetchRolePermissions(businessId, role) {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("business_id", businessId)
    .eq("role", role);
  return {
    data: (data ?? []).map((r) => r.permission),
    error: error?.message ?? "",
  };
}

// Accepts an invitation and returns the business id. RPC messages are readable and shown as they are.
// The token is a secret: it is never logged here.
export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  return { data: data ?? null, error: error?.message ?? "" };
}
