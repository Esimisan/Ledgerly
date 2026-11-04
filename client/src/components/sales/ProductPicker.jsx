import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import ProductThumb from "../products/ProductThumb";
import { useDebounced } from "../../hooks/useDebounced";
import { useImageUrls } from "../../hooks/useImageUrls";
import { searchSellableProducts } from "../../data/sales";
import { formatMoney, formatQty } from "../../lib/format";

// onAdd(product) puts one unit of the product in the cart.
export default function ProductPicker({ businessId, symbol, onAdd }) {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 250);
  const [state, setState] = useState({ loading: false, rows: [], error: "" });
  const inputRef = useRef(null);

  useEffect(() => {
    const text = debounced.trim();
    if (!text) {
      setState({ loading: false, rows: [], error: "" });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    searchSellableProducts({ businessId, q: text }).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, debounced]);

  const urls = useImageUrls(state.rows.map((r) => r.image_path));
  const showing = term.trim() !== "";

  function add(product) {
    onAdd(product);
    setTerm("");
    inputRef.current?.focus(); // ready for the next scan or search
  }

  // Enter: add an exact SKU/barcode match, or the only result. Barcode scanners
  // type the code and press Enter.
  async function onKeyDown(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const text = term.trim();
    if (!text) return;
    const { rows, error } = await searchSellableProducts({
      businessId,
      q: text,
    });
    if (error) {
      setState({ loading: false, rows: [], error });
      return;
    }
    const lower = text.toLowerCase();
    const exact = rows.find((r) =>
      [r.barcode, r.sku].some((v) => v && v.toLowerCase() === lower),
    );
    const pick = exact ?? (rows.length === 1 ? rows[0] : null);
    if (pick && Number(pick.quantity_on_hand) > 0) add(pick);
    else setState({ loading: false, rows, error: "" });
  }

  return (
    <div className="stack">
      <div className="toolbar__search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          className="input"
          type="search"
          aria-label="Search products to add"
          placeholder="Search name or SKU, or scan a barcode"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onKeyDown}
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
              {state.rows.map((p) => {
                const out = Number(p.quantity_on_hand) <= 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="pick-item"
                      disabled={out}
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
                        <span>{formatMoney(p.selling_price, symbol)}</span>
                        <span className="product-cell__sub">
                          {out
                            ? "Out of stock"
                            : `${formatQty(p.quantity_on_hand)} ${p.unit}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
