import { useState } from "react";
import Modal from "../ui/Modal";
import { setCustomerActive, customerError } from "../../data/customers";
import { formatMoney } from "../../lib/format";

export default function DeactivateCustomerModal({
  open,
  onClose,
  businessId,
  customer,
  symbol,
  onDone,
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const balance = Number(customer.balance);

  async function confirm() {
    setError("");
    setBusy(true);
    const { error: err } = await setCustomerActive(
      customer.id,
      businessId,
      false,
    );
    setBusy(false);
    if (err) {
      setError(customerError(err).message);
      return;
    }
    onDone(`${customer.name} was deactivated.`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Deactivate customer?">
      <div className="stack">
        <p className="modal__text">
          <strong>{customer.name}</strong> will no longer be offered when you
          record a sale. Their history stays on record, and you can reactivate
          them at any time.
        </p>

        {balance > 0 && (
          <p className="alert alert--danger" role="status">
            This customer still owes {formatMoney(balance, symbol)}. The balance
            stays on record after deactivation.
          </p>
        )}
        {balance < 0 && (
          <p className="info-note">
            This customer has {formatMoney(Math.abs(balance), symbol)} of store
            credit. It stays on record after deactivation.
          </p>
        )}

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
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy}
            onClick={confirm}
          >
            {busy ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
