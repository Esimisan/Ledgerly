import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  REFUND_METHODS,
  RETURN_CONDITIONS,
  createReturn,
  saleError,
} from "../../data/sales";
import { formatMoney, formatQty } from "../../lib/format";
import { parseQty, toCents } from "../../lib/saleInput";

// Mirrors the database: the net price per unit is rounded DOWN to the kobo, and
// the line refund is quantity x that. Integer maths, so no floating-point drift.
function lineRefundCents(lineTotal, soldQty, qty) {
  const qtyMilli = Math.round(qty * 1000);
  const soldMilli = Math.round(soldQty * 1000);
  const unitCents = Math.floor((toCents(lineTotal) * 1000) / soldMilli);
  return Math.round((unitCents * qtyMilli) / 1000);
}

// items = this sale's lines (with returned_quantity). onDone gets the create_return result.
export default function ReturnModal({
  open,
  onClose,
  businessId,
  sale,
  items,
  symbol,
  onDone,
}) {
  const [lines, setLines] = useState(() =>
    items
      .map((i) => ({
        id: i.id,
        name: i.product_name,
        sold: Number(i.quantity),
        remaining:
          Math.round(
            (Number(i.quantity) - Number(i.returned_quantity)) * 1000,
          ) / 1000,
        lineTotal: i.line_total,
        quantity: "",
        condition: "resellable",
      }))
      .filter((l) => l.remaining > 0),
  );
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const hasCustomer = Boolean(sale.customer_id);
  const methods = REFUND_METHODS.filter(
    (m) => hasCustomer || m.value !== "store_credit",
  );

  const patch = (id, change) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...change } : l)));

  // ---------- validation and the live preview ----------
  const picked = lines.filter((l) => l.quantity.trim() !== "");
  const lineErrors = {};
  let refundCents = 0;
  for (const l of picked) {
    const qty = parseQty(l.quantity);
    if (qty === null)
      lineErrors[l.id] = "Enter a quantity above 0, with at most 3 decimals.";
    else if (qty > l.remaining)
      lineErrors[l.id] =
        `Only ${formatQty(l.remaining)} can still be returned.`;
    else refundCents += lineRefundCents(l.lineTotal, l.sold, qty);
  }
  const hasErrors = Object.keys(lineErrors).length > 0;

  // Debt still owed on this sale is cancelled first; the rest is paid out.
  const owedCents = hasCustomer ? toCents(sale.amount_outstanding) : 0;
  const offsetCents = Math.min(refundCents, owedCents);
  const paidOutCents = refundCents - offsetCents;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (picked.length === 0) {
      setError("Enter the quantity of at least one item being returned.");
      return;
    }
    if (hasErrors) return;

    setBusy(true);
    const { data, error: err } = await createReturn({
      businessId,
      saleId: sale.id,
      items: picked.map((l) => ({
        saleItemId: l.id,
        quantity: parseQty(l.quantity),
        condition: l.condition,
      })),
      refundMethod: paidOutCents > 0 ? method : null,
      reason,
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
      title={`Return items from ${sale.sale_label}`}
    >
      <form className="stack return-form" onSubmit={submit} noValidate>
        <p className="modal__text">
          Enter how many of each item the customer is bringing back. Items
          marked resellable go back into stock; damaged items are refunded but
          not restocked.
        </p>

        <ul className="return-lines">
          {lines.map((l) => (
            <li className="return-line" key={l.id}>
              <div className="return-line__info">
                <span className="product-cell__name">{l.name}</span>
                <span className="product-cell__sub">
                  Sold {formatQty(l.sold)}
                  {l.sold - l.remaining > 0
                    ? `, already returned ${formatQty(l.sold - l.remaining)}`
                    : ""}
                  {" · "}
                  {formatQty(l.remaining)} can be returned
                </span>
              </div>
              <div className="return-line__fields">
                <Field
                  label="Quantity"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={l.quantity}
                  error={lineErrors[l.id]}
                  onChange={(e) => patch(l.id, { quantity: e.target.value })}
                />
                <Field
                  as="select"
                  label="Condition"
                  value={l.condition}
                  onChange={(e) => patch(l.id, { condition: e.target.value })}
                >
                  {RETURN_CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Field>
              </div>
              <button
                type="button"
                className="link-btn return-line__all"
                onClick={() => patch(l.id, { quantity: String(l.remaining) })}
              >
                Return all {formatQty(l.remaining)}
              </button>
            </li>
          ))}
        </ul>

        {refundCents > 0 && !hasErrors && (
          <dl className="summary">
            <div className="summary__row summary__row--total">
              <dt>Refund</dt>
              <dd>{formatMoney(refundCents / 100, symbol)}</dd>
            </div>
            {offsetCents > 0 && (
              <div className="summary__row">
                <dt>Cancels what is still owed on this sale</dt>
                <dd>{formatMoney(offsetCents / 100, symbol)}</dd>
              </div>
            )}
            {paidOutCents > 0 && (
              <div className="summary__row">
                <dt>To pay back to the customer</dt>
                <dd>{formatMoney(paidOutCents / 100, symbol)}</dd>
              </div>
            )}
          </dl>
        )}

        {paidOutCents > 0 && !hasErrors && (
          <Field
            as="select"
            label="Refund method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            hint={
              method === "store_credit"
                ? `Added to ${sale.customer_name || "the customer"}'s balance as store credit, and used automatically on their next sale.`
                : "The app records the refund but does not move the money, so hand it over yourself."
            }
          >
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Field>
        )}

        <Field
          as="textarea"
          label="Reason (optional)"
          rows={2}
          maxLength={500}
          value={reason}
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
          <button className="btn btn--primary" disabled={busy}>
            {busy
              ? "Processing…"
              : refundCents > 0 && !hasErrors
                ? `Return and refund ${formatMoney(refundCents / 100, symbol)}`
                : "Process return"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
