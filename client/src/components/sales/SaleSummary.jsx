import BalanceText from "../customers/BalanceText";
import { formatMoney } from "../../lib/format";
import { toCents } from "../../lib/saleInput";

function discountLabel(quote, promoCode) {
  switch (quote.discount_source) {
    case "customer":
      return `Customer discount (${Number(quote.customer_discount_percent)}%)`;
    case "promo":
      return `Promo ${promoCode.trim().toUpperCase()}`;
    case "manual":
      return "Manual discount";
    default:
      return "Discount";
  }
}

// settled = the quote on screen matches the cart (otherwise the numbers are dimmed).
export default function SaleSummary({
  quote,
  settled,
  symbol,
  paidCents,
  customer,
  promoCode,
}) {
  if (!quote)
    return <p className="card__sub">Add products to see the total.</p>;

  const total = toCents(quote.total);
  const discount = Number(quote.discount_total);
  const remainder = total - paidCents;

  return (
    <>
      <dl className={`summary ${settled ? "" : "is-stale"}`}>
        <div className="summary__row">
          <dt>Subtotal</dt>
          <dd>{formatMoney(quote.subtotal, symbol)}</dd>
        </div>
        {discount > 0 && (
          <div className="summary__row">
            <dt>{discountLabel(quote, promoCode)}</dt>
            <dd>−{formatMoney(discount, symbol)}</dd>
          </div>
        )}
        <div className="summary__row summary__row--total">
          <dt>Total</dt>
          <dd>{formatMoney(quote.total, symbol)}</dd>
        </div>
        <div className="summary__row">
          <dt>Paid now</dt>
          <dd>{formatMoney(paidCents / 100, symbol)}</dd>
        </div>
        {remainder > 0 && (
          <div className="summary__row summary__row--owes">
            <dt>{customer ? "On credit" : "Still to pay"}</dt>
            <dd>{formatMoney(remainder / 100, symbol)}</dd>
          </div>
        )}
        {remainder < 0 && (
          <div className="summary__row summary__row--over">
            <dt>Paid too much by</dt>
            <dd>{formatMoney(Math.abs(remainder) / 100, symbol)}</dd>
          </div>
        )}
      </dl>

      {customer && remainder > 0 && (
        <p className="card__sub">
          {customer.name}&rsquo;s balance after this sale:{" "}
          <BalanceText
            value={Number(customer.balance) + remainder / 100}
            symbol={symbol}
          />
        </p>
      )}
    </>
  );
}
