// Whole kobo, so adding amounts never drifts (0.1 + 0.2 problem).
export const toCents = (value) => Math.round(Number(value || 0) * 100);

const decimalsOk = (n, places) =>
  Math.abs(n * 10 ** places - Math.round(n * 10 ** places)) < 1e-6;

// "2.5" -> 2.5. Returns null when empty, not a number, zero or negative, too big,
// or with more than 3 decimal places (the database column keeps 3).
export function parseQty(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0 || n >= 1_000_000_000) return null;
  return decimalsOk(n, 3) ? n : null;
}

// Same idea for money: above zero, at most 2 decimal places.
export function parseAmount(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0 || n >= 1_000_000_000_000) return null;
  return decimalsOk(n, 2) ? n : null;
}

export function newPayment(method = "cash") {
  return { key: crypto.randomUUID(), method, amount: "", reference: "" };
}

// The manual discount box. "active" means the cashier typed a value.
export function checkManual(on, manual) {
  const text = (manual?.value ?? "").trim();
  if (!on || text === "") return { active: false, valid: true, error: "" };
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0)
    return {
      active: true,
      valid: false,
      error: "Enter a value greater than zero.",
    };
  if (!decimalsOk(n, 2))
    return {
      active: true,
      valid: false,
      error: "Use at most 2 decimal places.",
    };
  if (manual.type === "percent" && n > 100)
    return {
      active: true,
      valid: false,
      error: "A percentage cannot be more than 100.",
    };
  if (n >= 1_000_000_000)
    return { active: true, valid: false, error: "That number is too large." };
  return { active: true, valid: true, error: "", value: n };
}
