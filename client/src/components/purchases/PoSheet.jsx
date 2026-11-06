import { formatExpenseDate } from "../../data/expenses";
import { formatDateTime, formatMoney, formatQty } from "../../lib/format";

export default function PoSheet({ businessName, po, items, symbol }) {
  const shipping = Number(po.shipping_cost);
  return (
    <article
      className="receipt"
      data-theme="light"
      aria-label={`Purchase order ${po.po_label}`}
    >
      <header className="receipt__head">
        <p className="receipt__business">{businessName}</p>
        <h2 className="receipt__title">Purchase order</h2>
        <p className="receipt__meta">
          {po.po_label} · {formatDateTime(po.created_at)}
        </p>
      </header>

      {po.status === "cancelled" && (
        <p className="receipt__void">
          CANCELLED{po.cancel_reason ? ` — ${po.cancel_reason}` : ""}
        </p>
      )}

      <dl className="receipt__parties">
        <div>
          <dt>Supplier</dt>
          <dd>{po.supplier_name}</dd>
        </div>
        <div>
          <dt>Expected delivery</dt>
          <dd>{formatExpenseDate(po.expected_date)}</dd>
        </div>
      </dl>

      <ul className="receipt__lines">
        {items.map((i) => (
          <li key={i.id} className="receipt__line">
            <div className="receipt__line-main">
              <span className="receipt__name">{i.product_name}</span>
              <span className="receipt__sub">
                {formatQty(i.quantity_ordered)} {i.product_unit} ×{" "}
                {formatMoney(i.unit_cost, symbol)}
              </span>
            </div>
            <span className="receipt__amount">
              {formatMoney(i.line_total, symbol)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="summary receipt__totals">
        <div className="summary__row">
          <dt>Subtotal</dt>
          <dd>{formatMoney(po.subtotal, symbol)}</dd>
        </div>
        {shipping > 0 && (
          <div className="summary__row">
            <dt>Shipping</dt>
            <dd>{formatMoney(shipping, symbol)}</dd>
          </div>
        )}
        <div className="summary__row summary__row--total">
          <dt>Total</dt>
          <dd>{formatMoney(po.total, symbol)}</dd>
        </div>
      </dl>

      {po.notes && <p className="receipt__note">{po.notes}</p>}
    </article>
  );
}
