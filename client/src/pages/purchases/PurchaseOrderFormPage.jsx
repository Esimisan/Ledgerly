import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import PoLinesEditor from "../../components/purchases/PoLinesEditor";
import { useAuth } from "../../context/AuthContext";
import { listSupplierOptions } from "../../data/suppliers";
import {
  getPurchaseOrder,
  listPoItems,
  poError,
  savePurchaseOrder,
} from "../../data/purchaseOrders";
import { formatMoney } from "../../lib/format";
import { lineCents, parseCost, parseQty, toCents } from "../../lib/saleInput";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST = "/inventory/purchase-orders";

export default function PurchaseOrderFormPage() {
  const { poId } = useParams();
  const editing = Boolean(poId);
  const validId = !editing || UUID.test(poId);
  const navigate = useNavigate();
  const { business } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";

  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [shipping, setShipping] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [load, setLoad] = useState({
    loading: editing && validId,
    po: null,
    error: "",
  });
  const [suppliers, setSuppliers] = useState({ rows: [], error: "" });

  useEffect(() => {
    let cancelled = false;
    listSupplierOptions(businessId).then(({ data, error }) => {
      if (!cancelled)
        setSuppliers({ rows: data ?? [], error: error?.message ?? "" });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // Editing: load the draft and fill the form once.
  useEffect(() => {
    if (!editing || !validId) return;
    let cancelled = false;
    (async () => {
      const [{ data: po, error }, items] = await Promise.all([
        getPurchaseOrder(businessId, poId),
        listPoItems(businessId, poId),
      ]);
      if (cancelled) return;
      if (error || items.error || !po) {
        setLoad({
          loading: false,
          po: null,
          error: error?.message || items.error || "",
        });
        return;
      }
      setSupplierId(po.supplier_id);
      setExpected(po.expected_date ?? "");
      setShipping(
        Number(po.shipping_cost) ? String(Number(po.shipping_cost)) : "",
      );
      setNotes(po.notes ?? "");
      setLines(
        items.rows.map((i) => ({
          productId: i.product_id,
          name: i.product_name,
          sku: i.product_sku,
          unit: i.product_unit,
          imagePath: null, // the lines view has no image, so a placeholder shows
          currentCost: i.current_cost_price,
          quantity: String(Number(i.quantity_ordered)),
          unitCost: String(Number(i.unit_cost)),
        })),
      );
      setLoad({ loading: false, po, error: "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, validId, businessId, poId]);

  const back = (
    <Link className="back-link" to={editing && poId ? `${LIST}/${poId}` : LIST}>
      <ArrowLeft size={16} aria-hidden="true" />{" "}
      {editing ? "Back to the order" : "All purchase orders"}
    </Link>
  );

  if (!validId || (editing && !load.loading && (load.error || !load.po))) {
    return (
      <>
        <PageHeader title="Purchase order" />
        <Link className="back-link" to={LIST}>
          <ArrowLeft size={16} aria-hidden="true" /> All purchase orders
        </Link>
        <section className="card">
          <div className="empty">
            <h2 className="card__title">
              {load.error
                ? "Could not load this purchase order"
                : "Purchase order not found"}
            </h2>
            <p className="card__sub">
              {load.error ||
                "This order does not exist in your business, or the link is wrong."}
            </p>
          </div>
        </section>
      </>
    );
  }

  if (load.loading) {
    return (
      <>
        <PageHeader title="Purchase order" subtitle="Loading…" />
        <section className="card" aria-busy="true">
          <div className="empty">
            <div className="spinner" style={{ margin: "0 auto" }} />
          </div>
        </section>
      </>
    );
  }

  if (editing && load.po.status !== "draft") {
    return (
      <>
        <PageHeader title={load.po.po_label} />
        {back}
        <section className="card">
          <div className="empty">
            <h2 className="card__title">This order can no longer be edited</h2>
            <p className="card__sub">
              Only a draft can be changed. Once an order is placed it is locked,
              and you can receive stock against it or cancel it.
            </p>
          </div>
        </section>
      </>
    );
  }

  // ---------- numbers ----------
  let subtotalCents = 0;
  let linesValid = lines.length > 0;
  for (const l of lines) {
    const qty = parseQty(l.quantity);
    const cost = parseCost(l.unitCost);
    if (qty === null || cost === null) linesValid = false;
    else subtotalCents += lineCents(qty, cost);
  }
  const shippingValue = shipping.trim() === "" ? 0 : parseCost(shipping);
  const shippingCents = shippingValue === null ? 0 : toCents(shippingValue);
  const totalCents = subtotalCents + shippingCents;

  let blocker = "";
  if (!supplierId) blocker = "Choose a supplier.";
  else if (lines.length === 0) blocker = "Add at least one product.";
  else if (!linesValid) blocker = "Fix the quantities and costs marked in red.";
  else if (shippingValue === null) blocker = "Fix the shipping cost.";
  const canSave = !blocker && !busy;

  // The current supplier may have been deactivated since the draft was saved.
  const supplierRows = [...suppliers.rows];
  if (
    editing &&
    load.po &&
    !supplierRows.some((s) => s.id === load.po.supplier_id)
  )
    supplierRows.push({
      id: load.po.supplier_id,
      name: `${load.po.supplier_name} (inactive)`,
    });

  async function save(place) {
    if (!canSave) return;
    setSubmitError("");
    setBusy(true);
    const { data, error } = await savePurchaseOrder({
      businessId,
      id: editing ? poId : null,
      supplierId,
      lines,
      expectedDate: expected,
      shippingCost: shippingValue ?? 0,
      notes,
      place,
    });
    setBusy(false);
    if (error) {
      setSubmitError(poError(error));
      return;
    }
    navigate(`${LIST}/${data.purchase_order_id}`, {
      state: {
        notice: place
          ? `${data.po_label} was placed. You can receive stock against it when it arrives.`
          : `${data.po_label} was saved as a draft.`,
      },
    });
  }

  return (
    <>
      <PageHeader
        title={editing ? `Edit ${load.po.po_label}` : "New purchase order"}
        subtitle="Choose a supplier, add the products and the cost you expect to pay"
      />
      {back}

      <div className="till">
        <div className="till__main">
          <section className="card stack">
            <h2 className="card__title">Supplier</h2>
            <Field
              as="select"
              label="Supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              error={suppliers.error ? "Could not load suppliers." : undefined}
              hint={
                suppliers.rows.length === 0 && !suppliers.error
                  ? "No active suppliers yet. Add one under Inventory, Suppliers first."
                  : undefined
              }
            >
              <option value="">Choose a supplier</option>
              {supplierRows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Field>
          </section>

          <section className="card stack">
            <h2 className="card__title">Products</h2>
            <PoLinesEditor
              businessId={businessId}
              symbol={symbol}
              lines={lines}
              onChange={setLines}
            />
          </section>
        </div>

        <aside className="till__side" aria-label="Delivery, costs and total">
          <section className="card stack">
            <h2 className="card__title">Delivery and costs</h2>
            <Field
              label="Expected delivery (optional)"
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
            <Field
              label={`Shipping cost (${symbol}, optional)`}
              inputMode="decimal"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              error={
                shippingValue === null
                  ? "Enter 0 or more, at most 2 decimals."
                  : undefined
              }
              hint="Added to the order total. It is not spread into product costs."
            />
            <Field
              as="textarea"
              label="Note (optional)"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </section>

          <section className="card stack">
            <h2 className="card__title">Summary</h2>
            <dl className="summary">
              <div className="summary__row">
                <dt>Products</dt>
                <dd>{formatMoney(subtotalCents / 100, symbol)}</dd>
              </div>
              {shippingCents > 0 && (
                <div className="summary__row">
                  <dt>Shipping</dt>
                  <dd>{formatMoney(shippingCents / 100, symbol)}</dd>
                </div>
              )}
              <div className="summary__row summary__row--total">
                <dt>Total</dt>
                <dd>{formatMoney(totalCents / 100, symbol)}</dd>
              </div>
            </dl>

            {submitError && (
              <div className="alert alert--danger" role="alert">
                {submitError}
              </div>
            )}
            {blocker && (
              <p className="field__hint" role="status">
                {blocker}
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={!canSave}
              onClick={() => save(true)}
            >
              {busy ? "Saving…" : "Save and place order"}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--block"
              disabled={!canSave}
              onClick={() => save(false)}
            >
              Save as draft
            </button>
            <p className="field__hint">
              A draft can still be edited. A placed order is locked and ready to
              receive stock.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
