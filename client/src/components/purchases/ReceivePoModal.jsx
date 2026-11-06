import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import { poError, receivePurchaseOrder } from "../../data/purchaseOrders";
import { formatMoney, formatQty } from "../../lib/format";
import { lineCents, parseCost, parseQty } from "../../lib/saleInput";

// items = the order's lines (with quantity_remaining). onDone gets the function result.
export default function ReceivePoModal({
  open,
  onClose,
  businessId,
  po,
  items,
  symbol,
  onDone,
}) {
  const [lines, setLines] = useState(() =>
    items
      .map((i) => ({
        id: i.id,
        name: i.product_name,
        unit: i.product_unit,
        remaining: Math.round(Number(i.quantity_remaining) * 1000) / 1000,
        currentCost: Number(i.current_cost_price),
        quantity: "",
        cost: String(Number(i.unit_cost)),
      }))
      .filter((l) => l.remaining > 0),
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [costChoice, setCostChoice] = useState(null); // null = follow the default
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = (id, change) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...change } : l)));

  // ---------- validation and the live preview ----------
  const picked = lines.filter((l) => l.quantity.trim() !== "");
  const lineErrors = {};
  let totalCents = 0;
  let costDiffers = false;
  for (const l of picked) {
    const qty = parseQty(l.quantity);
    const cost = parseCost(l.cost);
    const errs = {};
    if (qty === null)
      errs.quantity = "Enter a quantity above 0, with at most 3 decimals.";
    else if (qty > l.remaining)
      errs.quantity = `Only ${formatQty(l.remaining)} is still expected.`;
    if (cost === null) errs.cost = "Enter 0 or more, at most 2 decimals.";
    if (Object.keys(errs).length) lineErrors[l.id] = errs;
    else {
      totalCents += lineCents(qty, cost);
      if (cost !== l.currentCost) costDiffers = true;
    }
  }
  const hasErrors = Object.keys(lineErrors).length > 0;
  const completes = lines.every((l) => {
    const qty = parseQty(l.quantity);
    return (
      qty !== null && Math.round(qty * 1000) === Math.round(l.remaining * 1000)
    );
  });
  const updateCost = costChoice ?? costDiffers;

  function fillAll() {
    setLines((ls) => ls.map((l) => ({ ...l, quantity: String(l.remaining) })));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (picked.length === 0) {
      setError("Enter the quantity received for at least one product.");
      return;
    }
    if (hasErrors) return;

    setBusy(true);
    const { data, error: err } = await receivePurchaseOrder({
      businessId,
      poId: po.id,
      lines: picked.map((l) => ({
        itemId: l.id,
        quantity: parseQty(l.quantity),
        unitCost: parseCost(l.cost),
      })),
      reference,
      note,
      updateCost,
    });
    setBusy(false);
    if (err) {
      setError(poError(err));
      return;
    }
    onDone(data);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receive stock for ${po.po_label}`}
    >
      <form className="stack receive-form" onSubmit={submit} noValidate>
        <p className="modal__text">
          Enter how much of each product arrived. Leave a line empty if it did
          not arrive yet. The cost is what the supplier actually charged per
          unit.
        </p>
        <div>
          <button type="button" className="link-btn" onClick={fillAll}>
            Fill everything still expected
          </button>
        </div>

        <ul className="return-lines">
          {lines.map((l) => (
            <li className="return-line" key={l.id}>
              <div className="return-line__info">
                <span className="product-cell__name">{l.name}</span>
                <span className="product-cell__sub">
                  {formatQty(l.remaining)} {l.unit} still expected
                </span>
              </div>
              <div className="return-line__fields">
                <Field
                  label={`Received (${l.unit})`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={l.quantity}
                  error={lineErrors[l.id]?.quantity}
                  onChange={(e) => patch(l.id, { quantity: e.target.value })}
                />
                <Field
                  label={`Unit cost (${symbol})`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={l.cost}
                  error={lineErrors[l.id]?.cost}
                  onChange={(e) => patch(l.id, { cost: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="link-btn return-line__all"
                onClick={() => patch(l.id, { quantity: String(l.remaining) })}
              >
                Receive all {formatQty(l.remaining)}
              </button>
            </li>
          ))}
        </ul>

        {picked.length > 0 && !hasErrors && (
          <dl className="summary">
            <div className="summary__row summary__row--total">
              <dt>Value received</dt>
              <dd>{formatMoney(totalCents / 100, symbol)}</dd>
            </div>
            <div className="summary__row">
              <dt>After this delivery</dt>
              <dd>
                {completes ? "Order complete" : "Stays open for the rest"}
              </dd>
            </div>
          </dl>
        )}

        {picked.length > 0 && !hasErrors && costDiffers && (
          <label className="check">
            <input
              type="checkbox"
              checked={updateCost}
              onChange={(e) => setCostChoice(e.target.checked)}
            />
            Update each product&rsquo;s cost price to the cost received. Past
            sales keep the cost they were made with.
          </label>
        )}

        <div className="form-row form-row--2">
          <Field
            label="Delivery reference (optional)"
            value={reference}
            maxLength={100}
            hint="For example the supplier's delivery note number."
            onChange={(e) => setReference(e.target.value)}
          />
          <Field
            label="Note (optional)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

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
          <button className="btn btn--primary" disabled={busy}>
            {busy
              ? "Saving…"
              : picked.length > 0 && !hasErrors
                ? `Receive ${formatMoney(totalCents / 100, symbol)}`
                : "Receive stock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
