// Pure logic and storage for "which business is active". No React here.
const PREFIX = "ledgerly-active-business:";
const LEGACY_KEY = "ledgerly-active-business"; // old global key, removed on read

// The remembered business only counts if it is still an ACTIVE membership.
// Otherwise the first active membership. None active -> null.
export function chooseActive(memberships, rememberedId) {
  const active = (memberships ?? []).filter((m) => m.status === "active");
  return active.find((m) => m.businessId === rememberedId) ?? active[0] ?? null;
}

// A suspended or unknown business can never be switched to.
export function canSwitchTo(memberships, businessId) {
  return (memberships ?? []).some(
    (m) => m.businessId === businessId && m.status === "active",
  );
}

export function readRemembered(userId) {
  try {
    localStorage.removeItem(LEGACY_KEY);
    return userId ? localStorage.getItem(PREFIX + userId) : null;
  } catch {
    return null;
  }
}

export function writeRemembered(userId, businessId) {
  if (!userId || !businessId) return;
  try {
    localStorage.setItem(PREFIX + userId, businessId);
  } catch {
    /* ignore */
  }
}
