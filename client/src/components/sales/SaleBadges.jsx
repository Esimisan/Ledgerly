import { formatMoney } from "../../lib/format";

export function SaleStatusBadge({ status }) {
  return status === "voided" ? (
    <span className="badge badge--danger">Voided</span>
  ) : (
    <span className="badge badge--success">Completed</span>
  );
}

// Money state of a sale. A voided sale owes nothing; otherwise show what is still
// owed (amount_outstanding already accounts for debt cancelled by returns).
export function PaymentBadge({ sale, symbol }) {
  if (sale.status === "voided") return <span>—</span>;
  const owed = Number(sale.amount_outstanding);
  return owed > 0 ? (
    <span className="badge badge--warning">
      Owes {formatMoney(owed, symbol)}
    </span>
  ) : (
    <span className="badge badge--success">Paid</span>
  );
}
