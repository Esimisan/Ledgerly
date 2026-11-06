import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import { saleError, voidSale } from "../../data/sales";
import { formatMoney } from "../../lib/format";

// onDone receives the result of the void_sale function.
export default function VoidSaleModal({
  open,
  onClose,
  businessId,
  sale,
  symbol,
  onDone,
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const paid = Number(sale.amount_paid);
  const onCredit = sale.customer_id ? Number(sale.balance_due) : 0;

  async function confirm(e) {
    e.preventDefault();
    const text = reason.trim();
    setError("");
    if (!text) {
      setFieldError("Give a reason for voiding this sale.");
      return;
    }
    setFieldError("");
    setBusy(true);
    const { data, error: err } = await voidSale({
      businessId,
      saleId: sale.id,
      reason: text,
    });
    setBusy(false);
    if (err) {
      setError(saleError(err));
      return;
    }
    onDone(data);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Void sale ${sale.sale_label}?`}
    >
      <form className="stack" onSubmit={confirm} noValidate>
        <p className="modal__text">
          Voiding cancels this sale. The products go back into stock, and the
          sale stays on record marked as voided. This cannot be undone.
        </p>

        {paid > 0 && (
          <p className="alert alert--danger" role="status">
            {formatMoney(paid, symbol)} was taken when this sale was made. Hand
            it back to the customer yourself, because the app does not move
            money.
          </p>
        )}

        {sale.customer_id && (
          <p className="info-note">
            If {sale.customer_name || "the customer"} has paid money on account
            since this sale, that money stays on their account as store credit.
          </p>
        )}
        {onCredit > 0 && (
          <p className="info-note">
            The {formatMoney(onCredit, symbol)} that was put on credit will be
            removed from {sale.customer_name || "the customer"}&rsquo;s balance.
          </p>
        )}

        <Field
          as="textarea"
          label="Reason"
          rows={3}
          maxLength={500}
          value={reason}
          error={fieldError || undefined}
          hint="Shown on the sale and kept for your records."
          onChange={(e) => setReason(e.target.value)}
        />

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn btn--danger" disabled={busy}>
            {busy ? "Voiding…" : "Void sale"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
