import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import { cancelPurchaseOrder, poError } from "../../data/purchaseOrders";
import { formatQty } from "../../lib/format";

// onDone receives the result of the cancel_purchase_order function.
export default function CancelPoModal({
  open,
  onClose,
  businessId,
  po,
  onDone,
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const received = Number(po.quantity_received_total);

  async function confirm(e) {
    e.preventDefault();
    const text = reason.trim();
    setError("");
    if (!text) {
      setFieldError("Give a reason for cancelling this order.");
      return;
    }
    setFieldError("");
    setBusy(true);
    const { data, error: err } = await cancelPurchaseOrder({
      businessId,
      poId: po.id,
      reason: text,
    });
    setBusy(false);
    if (err) {
      setError(poError(err));
      return;
    }
    onDone(data);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Cancel ${po.po_label}?`}>
      <form className="stack" onSubmit={confirm} noValidate>
        <p className="modal__text">
          The order stays on record marked as cancelled, with your reason. Stock
          is never taken back by cancelling.
        </p>
        {received > 0 ? (
          <p className="info-note">
            {formatQty(received)} units have already arrived and stay in your
            inventory. Only what is still expected is cancelled. If something
            was received by mistake, correct it with a stock adjustment.
          </p>
        ) : (
          <p className="info-note">
            Nothing has been received yet, so your inventory does not change.
          </p>
        )}

        <Field
          as="textarea"
          label="Reason"
          rows={3}
          maxLength={500}
          value={reason}
          error={fieldError || undefined}
          hint="Shown on the order and kept for your records."
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
            Keep order
          </button>
          <button className="btn btn--danger" disabled={busy}>
            {busy ? "Cancelling…" : "Cancel order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
