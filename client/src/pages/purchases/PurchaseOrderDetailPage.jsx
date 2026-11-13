import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Package,
  Printer,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import CancelPoModal from "../../components/purchases/CancelPoModal";
import { PoStatusBadge } from "../../components/purchases/PoBadges";
import PoSheet from "../../components/purchases/PoSheet";
import ReceivePoModal from "../../components/purchases/ReceivePoModal";
import { useAuth } from "../../context/AuthContext";
import { useListQuery } from "../../hooks/useListQuery";
import { formatExpenseDate } from "../../data/expenses";
import {
  getPurchaseOrder,
  listPoItems,
  listPoReceipts,
  listReceiptLines,
  placePurchaseOrder,
  poError,
} from "../../data/purchaseOrders";
import { formatDateTime, formatMoney, formatQty } from "../../lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST = "/inventory/purchase-orders";

const INITIAL_DETAIL = {
  po: null,
  items: [],
  receipts: [],
  receiptLines: [],
  error: "",
};

async function fetchPoDetail({ businessId, poId }) {
  const { data: po, error } = await getPurchaseOrder(businessId, poId);
  if (error || !po) {
    return { ...INITIAL_DETAIL, error: error?.message ?? "" };
  }
  const [items, receipts] = await Promise.all([
    listPoItems(businessId, poId),
    listPoReceipts(businessId, poId),
  ]);
  const lines = await listReceiptLines(
    businessId,
    receipts.rows.map((r) => r.id),
  );
  return {
    po,
    items: items.rows,
    receipts: receipts.rows,
    receiptLines: lines.rows,
    error: items.error || receipts.error || lines.error,
  };
}

export default function PurchaseOrderDetailPage() {
  const { poId } = useParams();
  const location = useLocation();
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const validId = UUID.test(poId ?? "");
  const canManage = can("purchases.manage");

  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState(location.state?.notice ?? "");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const state = useListQuery(
    fetchPoDetail,
    { businessId, poId },
    INITIAL_DETAIL,
    { enabled: validId },
  );

  const { po, items, receipts, receiptLines } = state;

  const back = (
    <Link className="back-link no-print" to={LIST}>
      <ArrowLeft size={16} aria-hidden="true" /> All purchase orders
    </Link>
  );

  if (state.loading && !po) {
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

  if (!po) {
    return (
      <>
        <PageHeader title="Purchase order" />
        {back}
        <section className="card">
          <div className="empty">
            <h2 className="card__title">
              {state.error
                ? "Could not load this purchase order"
                : "Purchase order not found"}
            </h2>
            <p className="card__sub">
              {state.error ||
                "This order does not exist in your business, or the link is wrong."}
            </p>
          </div>
        </section>
      </>
    );
  }

  const status = po.status;
  const isDraft = status === "draft";
  const canReceive =
    canManage && (status === "ordered" || status === "partially_received");
  const canCancel =
    canManage && status !== "received" && status !== "cancelled";
  const shipping = Number(po.shipping_cost);
  const itemName = Object.fromEntries(items.map((i) => [i.id, i.product_name]));
  const itemUnit = Object.fromEntries(items.map((i) => [i.id, i.product_unit]));

  async function place() {
    setActionError("");
    setBusy(true);
    const { error } = await placePurchaseOrder({ businessId, poId: po.id });
    setBusy(false);
    if (error) {
      setActionError(poError(error));
      return;
    }
    setNotice(
      `${po.po_label} was placed. You can receive stock against it when it arrives.`,
    );
    state.reload();
  }

  function afterReceive(result) {
    const parts = [
      `Delivery recorded for ${result.po_label}: ${formatMoney(result.receipt_total, symbol)} of stock received.`,
      result.fully_received
        ? "Everything ordered has now arrived."
        : "The order stays open for the rest.",
    ];
    if (Number(result.costs_updated) > 0)
      parts.push(
        `Cost price updated on ${result.costs_updated} ${Number(result.costs_updated) === 1 ? "product" : "products"}.`,
      );
    setReceiving(false);
    setNotice(parts.join(" "));
    state.reload();
  }

  function afterCancel(result) {
    const parts = [`${result.po_label} was cancelled.`];
    if (result.had_received_stock)
      parts.push("The stock that already arrived stays in your inventory.");
    setCancelling(false);
    setNotice(parts.join(" "));
    state.reload();
  }

  return (
    <>
      <PageHeader title={po.po_label} subtitle="Purchase order" />
      {back}

      {notice && (
        <div className="alert alert--success no-print" role="status">
          {notice}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => setNotice("")}
          >
            Dismiss
          </button>
        </div>
      )}
      {actionError && (
        <div className="alert alert--danger no-print" role="alert">
          {actionError}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => setActionError("")}
          >
            Dismiss
          </button>
        </div>
      )}
      {state.error && (
        <div className="alert alert--danger no-print" role="alert">
          Some details could not be loaded: {state.error}
        </div>
      )}

      <div className="stack no-print">
        <section className="card profile-head">
          <div className="profile-head__top">
            <div className="profile-head__name">
              <h2>{po.po_label}</h2>
              <PoStatusBadge status={status} />
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => window.print()}
              >
                <Printer size={16} aria-hidden="true" /> Print
              </button>
              {canManage && isDraft && (
                <Link
                  className="btn btn--secondary btn--sm"
                  to={`${LIST}/${po.id}/edit`}
                >
                  Edit
                </Link>
              )}
              {canManage && isDraft && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy}
                  onClick={place}
                >
                  {busy ? "Placing…" : "Place order"}
                </button>
              )}
              {canReceive && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setReceiving(true)}
                >
                  Receive stock
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  className="btn btn--danger-outline btn--sm"
                  onClick={() => setCancelling(true)}
                >
                  Cancel order
                </button>
              )}
            </div>
          </div>

          <dl className="profile-details">
            <div>
              <dt>Supplier</dt>
              <dd>{po.supplier_name}</dd>
            </div>
            <div>
              <dt>Expected delivery</dt>
              <dd>{formatExpenseDate(po.expected_date)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>
                {formatDateTime(po.created_at)}
                {po.created_by_name ? ` · ${po.created_by_name}` : ""}
              </dd>
            </div>
            <div>
              <dt>Placed</dt>
              <dd>
                {po.ordered_at ? formatDateTime(po.ordered_at) : "Not yet"}
              </dd>
            </div>
            <div>
              <dt>Fully received</dt>
              <dd>
                {po.received_at ? formatDateTime(po.received_at) : "Not yet"}
              </dd>
            </div>
            {po.notes && (
              <div className="profile-details__wide">
                <dt>Note</dt>
                <dd>{po.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        {status === "cancelled" && (
          <div className="alert alert--danger" role="status">
            This order was cancelled on {formatDateTime(po.cancelled_at)}
            {po.cancelled_by_name ? ` by ${po.cancelled_by_name}` : ""}.
            {po.cancel_reason ? ` Reason: ${po.cancel_reason}` : ""}
          </div>
        )}

        <div className="grid-kpi">
          <div className="card">
            <div className="kpi__top">
              <span>Order total</span>
              <span className="kpi__icon">
                <Banknote size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">{formatMoney(po.total, symbol)}</div>
            <div className="kpi__trend">
              {shipping > 0
                ? `Includes ${formatMoney(shipping, symbol)} shipping`
                : "No shipping cost"}
            </div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Products ordered</span>
              <span className="kpi__icon">
                <ShoppingBag size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">{po.item_count}</div>
            <div className="kpi__trend">
              {formatQty(po.quantity_ordered_total)} units in total
            </div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Received</span>
              <span className="kpi__icon">
                <Package size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              {formatQty(po.quantity_received_total)} of{" "}
              {formatQty(po.quantity_ordered_total)}
            </div>
            <div className="kpi__trend">
              {po.receipt_count}{" "}
              {po.receipt_count === 1 ? "delivery" : "deliveries"}
            </div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Value received</span>
              <span className="kpi__icon">
                <Wallet size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              {formatMoney(po.received_value, symbol)}
            </div>
            <div className="kpi__trend">At the cost charged on delivery</div>
          </div>
        </div>

        <section className="card">
          <h2 className="card__title">Products on this order</h2>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Ordered</th>
                  <th className="num">Received</th>
                  <th className="num">Still expected</th>
                  <th className="num">Unit cost</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const remaining = Number(i.quantity_remaining);
                  return (
                    <tr key={i.id}>
                      <td className="cell-main">
                        <div className="product-cell__name">
                          {i.product_name}{" "}
                          {i.product_deleted_at && (
                            <span className="badge badge--danger">Deleted</span>
                          )}
                        </div>
                        <div className="product-cell__sub">
                          {i.product_sku || "No SKU"}
                        </div>
                      </td>
                      <td className="num" data-label="Ordered">
                        {formatQty(i.quantity_ordered)} {i.product_unit}
                      </td>
                      <td className="num" data-label="Received">
                        {formatQty(i.quantity_received)} {i.product_unit}
                      </td>
                      <td className="num" data-label="Still expected">
                        {status === "cancelled" || remaining === 0
                          ? "—"
                          : `${formatQty(remaining)} ${i.product_unit}`}
                      </td>
                      <td className="num" data-label="Unit cost">
                        {formatMoney(i.unit_cost, symbol)}
                      </td>
                      <td className="num" data-label="Total">
                        {formatMoney(i.line_total, symbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {receipts.length > 0 && (
          <section className="card stack">
            <div>
              <h2 className="card__title">Deliveries</h2>
              <p className="card__sub">
                Each time stock arrived against this order, newest first.
              </p>
            </div>
            {receipts.map((r) => {
              const lines = receiptLines.filter(
                (l) => l.purchase_receipt_id === r.id,
              );
              return (
                <article className="return-card" key={r.id}>
                  <div className="return-card__head">
                    <strong>{formatDateTime(r.received_at)}</strong>
                    <span className="product-cell__sub">
                      {r.created_by_name ? `${r.created_by_name}` : ""}
                      {r.reference ? ` · Ref ${r.reference}` : ""}
                    </span>
                  </div>
                  <p>
                    Received value{" "}
                    <strong>{formatMoney(r.total_value, symbol)}</strong>
                  </p>
                  {r.note && <p className="card__sub">Note: {r.note}</p>}
                  <ul className="return-card__lines">
                    {lines.map((l) => (
                      <li key={l.id}>
                        {formatQty(l.quantity)}{" "}
                        {itemUnit[l.purchase_order_item_id] ?? ""} ×{" "}
                        {itemName[l.purchase_order_item_id] || "Product"}
                        <span className="product-cell__sub">
                          {" "}
                          · at {formatMoney(l.unit_cost, symbol)} ·{" "}
                          {formatMoney(l.line_total, symbol)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>
        )}
      </div>

      <section className="po-print" aria-label="Printable purchase order">
        <PoSheet
          businessName={business.name}
          po={po}
          items={items}
          symbol={symbol}
        />
      </section>

      {canReceive && receiving && (
        <ReceivePoModal
          open
          onClose={() => setReceiving(false)}
          businessId={businessId}
          po={po}
          items={items}
          symbol={symbol}
          onDone={afterReceive}
        />
      )}
      {canCancel && cancelling && (
        <CancelPoModal
          open
          onClose={() => setCancelling(false)}
          businessId={businessId}
          po={po}
          onDone={afterCancel}
        />
      )}
    </>
  );
}
