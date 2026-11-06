import { PO_STATUS } from "../../data/purchaseOrders";

const TONE = {
  success: "badge--success",
  warning: "badge--warning",
  danger: "badge--danger",
  accent: "",
};

export function PoStatusBadge({ status }) {
  const s = PO_STATUS[status] ?? { label: status, tone: "accent" };
  return <span className={`badge ${TONE[s.tone]}`}>{s.label}</span>;
}
