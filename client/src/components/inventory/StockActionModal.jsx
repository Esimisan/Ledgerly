import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  adjustStock,
  countProductMovements,
  recordStockMovement,
  stockError,
} from "../../data/stock";
import { formatQty } from "../../lib/format";

const toNumber = (s) => Number(String(s).replace(/,/g, ""));
const round3 = (n) => Math.round(n * 1000) / 1000;
const tooManyDecimals = (n) => Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6;

const TYPE_OPTIONS = [
  { value: "opening_stock", label: "Opening stock (your starting quantity)" },
  { value: "purchase", label: "Stock added (bought or received)" },
  { value: "removal", label: "Stock removed (used, lost or given away)" },
  { value: "damage", label: "Damaged goods (written off)" },
  { value: "adjustment", label: "Stock count (set the real quantity)" },
];
const NEEDS_NOTE = ["removal", "damage", "adjustment"];
const HAS_COST = ["opening_stock", "purchase"];

export default function StockActionModal({
  open,
  onClose,
  businessId,
  product,
  symbol,
  onDone,
}) {
  const current = Number(product.quantity_on_hand);
  const [hasMovements, setHasMovements] = useState(null); // null = still checking
  const [type, setType] = useState(
    current === 0 ? "opening_stock" : "purchase",
  );
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Opening stock only makes sense before any other movement exists.
  useEffect(() => {
    let cancelled = false;
    countProductMovements(businessId, product.id).then(
      ({ count, error: err }) => {
        if (cancelled || err) return; // the database re-checks this rule anyway
        const used = (count ?? 0) > 0;
        setHasMovements(used);
        if (used) setType((t) => (t === "opening_stock" ? "purchase" : t));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [businessId, product.id]);

  const options = TYPE_OPTIONS.filter(
    (o) => o.value !== "opening_stock" || hasMovements !== true,
  );

  const isCount = type === "adjustment";
  const qty = toNumber(quantity);
  const qtyValid =
    quantity.trim() !== "" &&
    Number.isFinite(qty) &&
    (isCount ? qty >= 0 : qty > 0) &&
    !tooManyDecimals(qty);

  // What the stock would be after this change.
  let after = null;
  if (qtyValid) {
    if (isCount) after = qty;
    else if (type === "removal" || type === "damage") after = current - qty;
    else after = current + qty;
    after = round3(after);
  }

  let preview = null;
  let previewBad = false;
  if (after !== null) {
    if (after < 0) {
      preview = `Not enough stock: you only have ${formatQty(current)} ${product.unit}.`;
      previewBad = true;
    } else if (isCount) {
      const diff = round3(after - current);
      if (diff === 0) {
        preview = "Same as the current stock, so nothing would change.";
        previewBad = true;
      } else {
        preview = `Stock goes from ${formatQty(current)} to ${formatQty(after)} ${product.unit} (${diff > 0 ? "+" : ""}${formatQty(diff)}).`;
      }
    } else {
      preview = `Stock goes from ${formatQty(current)} to ${formatQty(after)} ${product.unit}.`;
    }
  }

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (quantity.trim() === "" || !Number.isFinite(qty))
      found.quantity = "Enter a number.";
    else if (isCount ? qty < 0 : qty <= 0)
      found.quantity = isCount
        ? "Enter 0 or more."
        : "Enter a quantity greater than 0.";
    else if (tooManyDecimals(qty))
      found.quantity = "Use at most 3 decimal places.";
    else if (after !== null && after < 0)
      found.quantity = `You only have ${formatQty(current)} ${product.unit} in stock.`;
    else if (isCount && after === current)
      found.quantity = "This matches the current stock. Nothing to adjust.";

    if (NEEDS_NOTE.includes(type) && !note.trim())
      found.note = "Add a short note explaining why.";

    let unitCost = null;
    if (HAS_COST.includes(type) && cost.trim() !== "") {
      const c = toNumber(cost);
      if (!Number.isFinite(c) || c < 0)
        found.cost = "Enter a cost of 0 or more.";
      else unitCost = Math.round(c * 100) / 100;
    }

    setErrors(found);
    if (Object.keys(found).length) return;

    setError("");
    setBusy(true);
    const { data, error: err } = isCount
      ? await adjustStock({
          businessId,
          productId: product.id,
          counted: qty,
          note: note.trim(),
        })
      : await recordStockMovement({
          businessId,
          productId: product.id,
          type,
          quantity: qty,
          unitCost,
          note: note.trim() || null,
        });
    setBusy(false);

    if (err) {
      setError(stockError(err));
      return;
    }
    onDone(
      `${product.name}: stock is now ${formatQty(data.balance_after)} ${product.unit}.`,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Update stock: ${product.name}`}
    >
      <form className="stack" onSubmit={submit} noValidate>
        <p className="modal__text">
          Currently in stock:{" "}
          <strong>
            {formatQty(current)} {product.unit}
          </strong>
        </p>

        <Field
          as="select"
          label="What happened?"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setErrors({});
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Field>

        <Field
          label={
            isCount
              ? `Counted quantity (${product.unit})`
              : `Quantity (${product.unit})`
          }
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
          hint={isCount ? "What you actually count right now." : undefined}
        />

        {preview && (
          <p
            className={`stock-preview ${previewBad ? "stock-preview--bad" : ""}`}
            aria-live="polite"
          >
            {preview}
          </p>
        )}

        {HAS_COST.includes(type) && (
          <Field
            label={`Cost per ${product.unit} (${symbol}, optional)`}
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            error={errors.cost}
            hint="Saved on this stock movement only. It does not change the product's cost price."
          />
        )}

        <Field
          as="textarea"
          rows={2}
          maxLength={500}
          label={
            NEEDS_NOTE.includes(type) ? "Note (required)" : "Note (optional)"
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
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
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Save stock change"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
