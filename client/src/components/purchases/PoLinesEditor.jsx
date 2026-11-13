import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import ProductThumb from "../products/ProductThumb";
import { useDebounced } from "../../hooks/useDebounced";
import { useImageUrls } from "../../hooks/useImageUrls";
import { useListQuery } from "../../hooks/useListQuery";
import { searchPoProducts } from "../../data/purchaseOrders";
import { formatMoney, formatQty } from "../../lib/format";
import { lineCents, parseCost, parseQty } from "../../lib/saleInput";

const EMPTY_SEARCH = { rows: [], error: "" };
const searchFor = ({ businessId, text }) =>
  searchPoProducts({ businessId, q: text });

// lines: [{ productId, name, sku, unit, imagePath, currentCost, quantity, unitCost }]
export default function PoLinesEditor({ businessId, symbol, lines, onChange }) {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 250);

  const text = debounced.trim();
  const state = useListQuery(searchFor, { businessId, text }, EMPTY_SEARCH, {
    enabled: Boolean(text),
  });

  const urls = useImageUrls([
    ...state.rows.map((r) => r.image_path),
    ...lines.map((l) => l.imagePath),
  ]);
  const showing = term.trim() !== "";

  function add(p) {
    const i = lines.findIndex((l) => l.productId === p.id);
    if (i >= 0) {
      const next = [...lines];
      const q = Number(next[i].quantity) || 0;
      next[i] = { ...next[i], quantity: String(+(q + 1).toFixed(3)) };
      onChange(next);
    } else {
      onChange([
        ...lines,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          imagePath: p.image_path,
          currentCost: p.cost_price,
          quantity: "1",
          unitCost: String(Number(p.cost_price)),
        },
      ]);
    }
    setTerm("");
  }

  const patch = (productId, change) =>
    onChange(
      lines.map((l) => (l.productId === productId ? { ...l, ...change } : l)),
    );
  const remove = (productId) =>
    onChange(lines.filter((l) => l.productId !== productId));

  return (
    <div className="stack">
      <div className="toolbar__search">
        <Search size={16} aria-hidden="true" />
        <input
          className="input"
          type="search"
          aria-label="Search products to order"
          placeholder="Search name, SKU or barcode"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {showing && state.error && (
        <div className="alert alert--danger" role="alert">
          Could not search products: {state.error}
        </div>
      )}
      {showing && !state.error && (
        <>
          {state.rows.length === 0 && !state.loading ? (
            <p className="card__sub">
              No active products match “{term.trim()}”.
            </p>
          ) : (
            <ul className="pick-list" aria-busy={state.loading}>
              {state.rows.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="pick-item"
                    onClick={() => add(p)}
                  >
                    <ProductThumb url={urls[p.image_path]} />
                    <span className="pick-item__body">
                      <span className="product-cell__name">{p.name}</span>
                      <span className="product-cell__sub">
                        {p.sku || "No SKU"}
                      </span>
                    </span>
                    <span className="pick-item__side">
                      <span>Cost {formatMoney(p.cost_price, symbol)}</span>
                      <span className="product-cell__sub">
                        {formatQty(p.quantity_on_hand)} {p.unit} in stock
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {lines.length === 0 ? (
        <div className="empty">
          <p className="card__sub">
            No products yet. Search above to add the first one.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Unit cost</th>
                <th className="num">Quantity</th>
                <th className="num">Total</th>
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const qty = parseQty(l.quantity);
                const cost = parseCost(l.unitCost);
                const total =
                  qty !== null && cost !== null
                    ? lineCents(qty, cost) / 100
                    : null;
                return (
                  <tr key={l.productId}>
                    <td className="cell-main">
                      <div className="product-cell">
                        <ProductThumb url={urls[l.imagePath]} />
                        <div>
                          <div className="product-cell__name">{l.name}</div>
                          <div className="product-cell__sub">
                            {l.sku ? `${l.sku} · ` : ""}
                            Current cost {formatMoney(l.currentCost, symbol)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num" data-label="Unit cost">
                      <div className="cost-cell">
                        <input
                          className="input cost-input"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          aria-label={`Unit cost of ${l.name}`}
                          aria-invalid={cost === null ? "true" : undefined}
                          value={l.unitCost}
                          onChange={(e) =>
                            patch(l.productId, { unitCost: e.target.value })
                          }
                        />
                        {cost === null && (
                          <span className="field__error">
                            Enter 0 or more, at most 2 decimals.
                          </span>
                        )}
                      </div>
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
                            onChange={(e) =>
                              patch(l.productId, { quantity: e.target.value })
                            }
                          />
                          <span className="product-cell__sub">{l.unit}</span>
                        </div>
                        {qty === null && (
                          <span className="field__error">
                            Enter a quantity above 0 (up to 3 decimals).
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="num" data-label="Total">
                      {total === null ? "—" : formatMoney(total, symbol)}
                    </td>
                    <td data-label="">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${l.name}`}
                        onClick={() => remove(l.productId)}
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
      )}
    </div>
  );
}
