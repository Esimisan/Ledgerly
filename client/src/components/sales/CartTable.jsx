import { Trash2 } from "lucide-react";
import ProductThumb from "../products/ProductThumb";
import { formatMoney, formatQty } from "../../lib/format";
import { parseQty, toCents } from "../../lib/saleInput";

// quoteLines: the server's priced lines, keyed by product id (may be empty while
// the first quote is loading, then the local price is shown).
export default function CartTable({
  cart,
  quoteLines,
  imageUrls,
  symbol,
  onQty,
  onRemove,
}) {
  if (cart.length === 0)
    return (
      <div className="empty">
        <p className="card__sub">
          No products yet. Search above to add the first one.
        </p>
      </div>
    );

  return (
    <div className="table-wrap">
      <table className="table table--stack">
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">Price</th>
            <th className="num">Quantity</th>
            <th className="num">Total</th>
            <th>
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cart.map((l) => {
            const ql = quoteLines[l.productId];
            const qty = parseQty(l.quantity);
            const price = ql ? ql.unit_price : l.price;
            const lineTotal = ql
              ? ql.line_total
              : qty === null
                ? null
                : (toCents(price) * qty) / 100;
            const onHand = ql ? ql.quantity_on_hand : l.onHand;
            const lineDiscount = ql ? Number(ql.discount_amount) : 0;
            return (
              <tr key={l.productId}>
                <td className="cell-main">
                  <div className="product-cell">
                    <ProductThumb url={imageUrls[l.imagePath]} />
                    <div>
                      <div className="product-cell__name">{l.name}</div>
                      <div className="product-cell__sub">
                        {l.sku ? `${l.sku} · ` : ""}
                        {formatQty(onHand)} {l.unit} in stock
                      </div>
                    </div>
                  </div>
                </td>
                <td className="num" data-label="Price">
                  {formatMoney(price, symbol)}
                </td>
                <td className="num" data-label="Quantity">
                  <div className="qty-cell">
                    <div className="qty-cell__row">
                      <input
                        className="input qty-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        aria-label={`Quantity of ${l.name}`}
                        aria-invalid={qty === null ? "true" : undefined}
                        value={l.quantity}
                        onChange={(e) => onQty(l.productId, e.target.value)}
                      />
                      <span className="product-cell__sub">{l.unit}</span>
                    </div>
                    {qty === null && (
                      <span className="field__error">
                        Enter a quantity above 0 (up to 3 decimals).
                      </span>
                    )}
                    {ql && !ql.stock_ok && (
                      <span className="line-warn">
                        Only {formatQty(ql.quantity_on_hand)} {l.unit} in stock
                      </span>
                    )}
                  </div>
                </td>
                <td className="num" data-label="Total">
                  <span className="amount-stack">
                    <span>
                      {lineTotal === null
                        ? "—"
                        : formatMoney(lineTotal, symbol)}
                    </span>
                    {lineDiscount > 0 && (
                      <span className="product-cell__sub">
                        Discount −{formatMoney(lineDiscount, symbol)}
                      </span>
                    )}
                  </span>
                </td>
                <td data-label="">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${l.name}`}
                    onClick={() => onRemove(l.productId)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
