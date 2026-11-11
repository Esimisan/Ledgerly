import { supabase } from "../lib/supabase";

const fail = (error) =>
  error?.message || "Something went wrong. Please try again.";

// RPC messages are written to be read by people, so they are shown as they are.
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  return { data: error ? null : data, error: error ? fail(error) : "" };
}

const first = (r) => ({ data: r.data?.[0] ?? null, error: r.error });

export const listMembers = (businessId) =>
  rpc("list_staff_members", { p_business_id: businessId });

export const setMemberRole = (businessId, userId, role) =>
  rpc("set_member_role", {
    p_business_id: businessId,
    p_user_id: userId,
    p_role: role,
  });

export const setMemberStatus = (businessId, userId, status) =>
  rpc("set_member_status", {
    p_business_id: businessId,
    p_user_id: userId,
    p_status: status,
  });

export const listInvitations = (businessId) =>
  rpc("list_invitations", { p_business_id: businessId });

export async function createInvitation(businessId, email, role, days) {
  return first(
    await rpc("create_invitation", {
      p_business_id: businessId,
      p_email: email,
      p_role: role,
      p_days: days,
    }),
  );
}

export const revokeInvitation = (businessId, invitationId) =>
  rpc("revoke_invitation", {
    p_business_id: businessId,
    p_invitation_id: invitationId,
  });

export async function previewInvitation(token) {
  return first(await rpc("get_invitation_preview", { p_token: token }));
}

export const acceptInvitation = (token) =>
  rpc("accept_invitation", { p_token: token });

export async function getMyMembershipState() {
  return rpc("my_membership_state", {});
}

export async function getRolePermissions(businessId) {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role, permission")
    .eq("business_id", businessId);
  if (error) return { data: null, error: fail(error) };
  const byRole = { admin: [], manager: [], staff: [] };
  for (const row of data ?? []) byRole[row.role]?.push(row.permission);
  return { data: byRole, error: "" };
}

export const saveRolePermissions = (businessId, role, permissions) =>
  rpc("set_role_permissions", {
    p_business_id: businessId,
    p_role: role,
    p_permissions: permissions,
  });

export const restoreRolePermissions = (businessId, role) =>
  rpc("restore_role_permissions", { p_business_id: businessId, p_role: role });

export const transferOwnership = (businessId, newOwnerId, confirmName) =>
  rpc("transfer_ownership", {
    p_business_id: businessId,
    p_new_owner: newOwnerId,
    p_confirm_name: confirmName,
  });
