import { csvDateTime } from "./csv";

const FIELD_LABELS = {
  role: "Role",
  status: "Status",
  name: "Name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  currency_code: "Currency",
  currency_symbol: "Currency symbol",
  timezone: "Timezone",
  default_tax_rate: "Tax rate",
  receipt_footer: "Receipt footer",
  low_stock_default: "Low-stock default",
  is_active: "Active",
  cost_price: "Cost price",
  selling_price: "Selling price",
  discount_percent: "Discount %",
  amount: "Amount",
  expense_date: "Date",
};

// Shown as "changed" only: the values would be ids or file paths.
const CHANGED_ONLY = {
  category_id: "Category",
  logo_path: "Logo",
};

const label = (key) => FIELD_LABELS[key] ?? key.replace(/_/g, " ");
const keyText = (key) => key.replace(/[._]/g, " ");
const isDiff = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && ("old" in v || "new" in v);

function short(value) {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

// One line of detail for a log row. The summary already says what happened,
// so only field changes and permission lists are spelled out here.
export function changeDetails(changes) {
  if (!changes || typeof changes !== "object") return "";
  const parts = [];
  if (Array.isArray(changes.added) && changes.added.length)
    parts.push(`Allowed: ${changes.added.map(keyText).join(", ")}`);
  if (Array.isArray(changes.removed) && changes.removed.length)
    parts.push(`No longer allowed: ${changes.removed.map(keyText).join(", ")}`);
  for (const [key, value] of Object.entries(changes)) {
    if (!isDiff(value)) continue;
    if (CHANGED_ONLY[key]) parts.push(`${CHANGED_ONLY[key]}: changed`);
    else parts.push(`${label(key)}: ${short(value.old)} → ${short(value.new)}`);
  }
  return parts.join(" · ");
}

export const AUDIT_CSV_COLUMNS = [
  { header: "When (Lagos time)", value: (r) => csvDateTime(r.created_at) },
  { header: "Person", value: (r) => r.actor_name },
  { header: "Area", value: (r) => r.area },
  { header: "Action", value: (r) => r.action },
  { header: "What happened", value: (r) => r.summary },
  { header: "Details", value: (r) => changeDetails(r.changes) },
];
