import {
  formatDateTime,
  formatMoney,
  formatQty,
  humanize,
} from "../../lib/format";

// Always rendered in the light theme (data-theme="light"), so it looks like paper
// on screen and prints correctly even while the app is in Dark mode.
export default function Receipt({
  businessName,
  sale,
  items,
  payments,
  symbol,
}) {
  const owed = Number(sale.amount_outstanding);
  const discount = Number(sale.discount_total);
  const refunded = Number(sale.refunded_total);
  const title = owed > 0 ? "Invoice" : "Receipt";

  return (
    <article
      className="receipt"
      data-theme="light"
      aria-label={`${title} ${sale.sale_label}`}
    >
      <header className="receipt__head">
        <p className="receipt__business">{businessName}</p>
        <h2 className="receipt__title">{title}</h2>
        <p className="receipt__meta">
          {sale.sale_label} · {formatDateTime(sale.sold_at)}
        </p>
      </header>

      {sale.status === "voided" && (
        <p className="receipt__void">
          VOIDED{sale.void_reason ? ` — ${sale.void_reason}` : ""}
        </p>
      )}

      <dl className="receipt__parties">
        <div>
          <dt>Customer</dt>
          <dd>{sale.customer_name || "Walk-in customer"}</dd>
        </div>
        <div>
          <dt>Served by</dt>
          <dd>{sale.created_by_name || "—"}</dd>
        </div>
      </dl>

      <ul className="receipt__lines">
        {items.map((i) => {
          const lineDiscount = Number(i.discount_amount);
          return (
            <li key={i.id} className="receipt__line">
              <div className="receipt__line-main">
                <span className="receipt__name">{i.product_name}</span>
                <span className="receipt__sub">
                  {formatQty(i.quantity)} × {formatMoney(i.unit_price, symbol)}
                  {lineDiscount > 0
                    ? ` · discount −${formatMoney(lineDiscount, symbol)}`
                    : ""}
                </span>
              </div>
              <span className="receipt__amount">
                {formatMoney(i.line_total, symbol)}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="summary receipt__totals">
        <div className="summary__row">
          <dt>Subtotal</dt>
          <dd>{formatMoney(sale.subtotal, symbol)}</dd>
        </div>
        {discount > 0 && (
          <div className="summary__row">
            <dt>
              {sale.discount_name ? `Promo: ${sale.discount_name}` : "Discount"}
            </dt>
            <dd>−{formatMoney(discount, symbol)}</dd>
          </div>
        )}
        <div className="summary__row summary__row--total">
          <dt>Total</dt>
          <dd>{formatMoney(sale.total, symbol)}</dd>
        </div>
        {payments.map((p) => (
          <div className="summary__row" key={p.id}>
            <dt>Paid by {humanize(p.method).toLowerCase()}</dt>
            <dd>{formatMoney(p.amount, symbol)}</dd>
          </div>
        ))}
        {refunded > 0 && (
          <div className="summary__row">
            <dt>Refunded</dt>
            <dd>{formatMoney(refunded, symbol)}</dd>
          </div>
        )}
        {owed > 0 && (
          <div className="summary__row summary__row--owes">
            <dt>Balance due</dt>
            <dd>{formatMoney(owed, symbol)}</dd>
          </div>
        )}
      </dl>

      {sale.notes && <p className="receipt__note">{sale.notes}</p>}
      <p className="receipt__thanks">Thank you for your patronage.</p>
    </article>
  );
}
