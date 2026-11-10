import {
  addDays,
  longDate,
  plural,
  shortDate,
  todayInLagos,
} from "./analytics.js";

export const MAX_RANGE_DAYS = 1096; // the database refuses more than three years

export const PRESETS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_30", label: "Last 30 days" },
  { key: "this_quarter", label: "This quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "custom", label: "Custom dates" },
];
export const PRESET_KEYS = PRESETS.map((p) => p.key);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");

export function isIsoDate(value) {
  if (!DATE_RE.test(value ?? "")) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return (
    t.getUTCFullYear() === y &&
    t.getUTCMonth() === m - 1 &&
    t.getUTCDate() === d
  );
}

// Number of calendar days from `from` to `to`, both included.
export function inclusiveDays(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (
    Math.round(
      (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000,
    ) + 1
  );
}

// Preset ranges are inclusive and run up to today, except last month (the whole month).
export function presetRange(key, today = todayInLagos()) {
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${pad(m)}-01`;
  switch (key) {
    case "this_month":
      return { from: monthStart, to: today };
    case "last_month": {
      const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
      return { from: prev, to: addDays(monthStart, -1) };
    }
    case "last_30":
      return { from: addDays(today, -29), to: today };
    case "this_quarter":
      return {
        from: `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`,
        to: today,
      };
    case "ytd":
      return { from: `${y}-01-01`, to: today };
    default:
      return null;
  }
}

// { preset, from, to, valid, error } from the URL values.
export function resolveRange({ preset, from, to }, today = todayInLagos()) {
  const key = PRESET_KEYS.includes(preset) ? preset : "this_month";
  if (key !== "custom") {
    return { preset: key, ...presetRange(key, today), valid: true, error: "" };
  }
  let error = "";
  if (!isIsoDate(from) || !isIsoDate(to))
    error = "Choose a start and an end date.";
  else if (from > to) error = "The end date is before the start date.";
  else if (inclusiveDays(from, to) > MAX_RANGE_DAYS)
    error = "Choose a range of three years or less.";
  return {
    preset: "custom",
    from: from ?? "",
    to: to ?? "",
    valid: !error,
    error,
  };
}

// THE ONE PLACE the inclusive end becomes the database's exclusive end.
export function toApiRange(from, to) {
  return { apiFrom: from, apiTo: addDays(to, 1) };
}

export function rangeLabel(from, to) {
  if (!from || !to) return "";
  if (from === to) return longDate(from);
  const fy = from.slice(0, 4);
  const ty = to.slice(0, 4);
  return fy === ty
    ? `${shortDate(from)} – ${shortDate(to)} ${ty}`
    : `${shortDate(from)} ${fy} – ${shortDate(to)} ${ty}`;
}

export const rangeDaysText = (from, to) =>
  plural(inclusiveDays(from, to), "day", "days");
