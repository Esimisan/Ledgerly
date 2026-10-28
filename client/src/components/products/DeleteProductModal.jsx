import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import {
  deleteError,
  deleteProduct,
  getProductUsage,
} from "../../data/products";
import { formatQty } from "../../lib/format";

const LABELS = {
  stock_movements: "stock movements",
  sale_items: "sale line items",
  sale_return_items: "returned items",
  purchase_order_items: "purchase order lines",
};
const labelFor = (table) => LABELS[table] ?? table.replace(/_/g, " ");

export default function DeleteProductModal({
  businessId,
  product,
  onClose,
  onDeleted,
}) {
  const [usage, setUsage] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getProductUsage(businessId, product.id).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setLoadError(deleteError(err));
      else setUsage(data);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, product.id]);

  async function onConfirm() {
    setError("");
    setBusy(true);
    const { data, error: err } = await deleteProduct(businessId, product.id);
    if (err) {
      setError(deleteError(err));
      setBusy(false);
      return;
    }
    onDeleted(data.result);
  }

  const references = usage ? Object.entries(usage.references) : [];
  const hasHistory = Boolean(usage && usage.total > 0);

  return (
    <Modal open onClose={onClose} title={`Delete “${product.name}”?`}>
      <div className="stack">
        {loadError ? (
          <div className="alert alert--danger" role="alert">
            {loadError}
          </div>
        ) : !usage ? (
          <div className="empty">
            <div className="spinner" style={{ margin: "0 auto" }} />
          </div>
        ) : (
          <>
            {!hasHistory ? (
              <div className="alert alert--danger" role="alert">
                <strong>This cannot be undone.</strong> This product has never
                been stocked, sold or ordered, so it will be permanently erased,
                along with its image.
              </div>
            ) : (
              <>
                <div className="alert alert--danger" role="alert">
                  <strong>This cannot be undone.</strong> This product is part
                  of your records:
                  <ul className="warn-list">
                    {references.map(([table, count]) => (
                      <li key={table}>
                        {count} {labelFor(table)}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="modal__text">If you delete it:</p>
                <ul className="warn-list">
                  <li>
                    It disappears from your catalogue, sales screen, inventory
                    and future reports.
                  </li>
                  <li>
                    Past sales, receipts, purchase orders and stock history are
                    kept and still show this product, so your totals stay
                    correct.
                  </li>
                  <li>
                    It cannot be restored from the app. Its SKU becomes free to
                    use again.
                  </li>
                </ul>
              </>
            )}

            {Number(usage.quantity_on_hand) > 0 && (
              <div className="alert alert--danger">
                {formatQty(usage.quantity_on_hand)} {usage.unit} are still
                recorded in stock. Deleting removes them from your inventory.
              </div>
            )}

            <p className="modal__text">
              Only want to stop selling it for now? Cancel and untick{" "}
              <strong>Active</strong> instead. It stays in your records and you
              can bring it back anytime.
            </p>

            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>I understand and want to delete this product.</span>
            </label>
          </>
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
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={onConfirm}
            disabled={!usage || !confirmed || busy}
          >
            {busy ? "Deleting…" : "Delete product"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
