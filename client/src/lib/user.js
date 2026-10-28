export function displayName(user) {
  const name = user?.user_metadata?.full_name?.trim();
  return name || user?.email?.split("@")[0] || "there";
}

export function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export const capitalize = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
