export function formatMoney(value, symbol = "₦") {
  const n = Number(value ?? 0);
  return `${symbol}${n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatQty(value) {
  return Number(value ?? 0).toLocaleString("en", { maximumFractionDigits: 3 });
}
