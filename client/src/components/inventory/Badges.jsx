import { MOVEMENT_TYPES } from "../../data/stock";

const TONE = {
  success: "badge--success",
  warning: "badge--warning",
  danger: "badge--danger",
  accent: "",
};

export function MovementTypeBadge({ type }) {
  const t = MOVEMENT_TYPES[type] ?? { label: type, tone: "accent" };
  return <span className={`badge ${TONE[t.tone]}`}>{t.label}</span>;
}

export function StockStatusBadge({ status }) {
  if (status === "out") return <span className="badge badge--danger">Out</span>;
  if (status === "low")
    return <span className="badge badge--warning">Low</span>;
  return null;
}
