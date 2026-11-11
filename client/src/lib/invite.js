const KEY = "ledgerly-pending-invite";

export const inviteLink = (token) =>
  `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;

export function readPendingInvite() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function savePendingInvite(token) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
