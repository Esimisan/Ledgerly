// Turns a business name into a safe file-name piece.
export function businessSlug(name) {
  return (
    String(name || "business")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "business"
  );
}

// "ledgerly-sales-2026-11-12.csv" -> "ledgerly-<business>-sales-2026-11-12.csv"
export function withBusinessName(filename, businessName) {
  const slug = businessSlug(businessName);
  const base = String(filename).replace(/^ledgerly-/, "");
  if (base.startsWith(`${slug}-`)) return `ledgerly-${base}`; // already carries it
  return `ledgerly-${slug}-${base}`;
}
