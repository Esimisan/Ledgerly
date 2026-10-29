import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import {
  countSupplierProducts,
  setSupplierActive,
  supplierError,
} from "../../data/suppliers";

export default function DeactivateSupplierModal({
  open,
  onClose,
  businessId,
  supplier,
  onDone,
}) {
  const [count, setCount] = useState(null); // null = still loading
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    countSupplierProducts(supplier.id, businessId).then(
      ({ count: c, error: err }) => {
        if (cancelled) return;
        if (err)
          setCount(0); // not essential: deactivating still works without the number
        else setCount(c ?? 0);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [supplier.id, businessId]);

  async function confirm() {
    setError("");
    setBusy(true);
    const { error: err } = await setSupplierActive(
      supplier.id,
      businessId,
      false,
    );
    setBusy(false);
    if (err) {
      setError(supplierError(err));
      return;
    }
    onDone(`${supplier.name} was deactivated.`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Deactivate supplier?">
      <div className="stack">
        <p className="modal__text">
          <strong>{supplier.name}</strong> will no longer be offered when you
          add or edit a product, and will not appear on new purchase orders. You
          can reactivate it at any time.
        </p>

        {count === null ? (
          <p className="modal__text">Checking which products use it…</p>
        ) : count > 0 ? (
          <p className="modal__text">
            {count} {count === 1 ? "product uses" : "products use"} this
            supplier. {count === 1 ? "It keeps" : "They keep"} the supplier on
            record, so nothing changes for existing products.
          </p>
        ) : (
          <p className="modal__text">No products use this supplier.</p>
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
