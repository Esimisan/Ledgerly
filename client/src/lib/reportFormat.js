import { formatMoney } from "./format";

export const dash = "—";

// null or undefined shows a dash (for example a finance-only figure the server hid).
export const money = (value, symbol) =>
  value === null || value === undefined ? dash : formatMoney(value, symbol);

export const pct = (value) =>
  value === null || value === undefined ? dash : `${Number(value)}%`;

export const whole = (value) => Number(value ?? 0).toLocaleString("en");
