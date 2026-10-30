import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import { MovementTypeBadge } from "../../components/inventory/Badges";
import { useAuth } from "../../context/AuthContext";
import { useDebounced } from "../../hooks/useDebounced";
import {
  getProductName,
  isDateParam,
  listMovements,
  MOVEMENT_TYPES,
} from "../../data/stock";
import { formatDateTime, formatMoney, formatQty } from "../../lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MovementsTab() {
  const { business } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";

  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const rawProduct = params.get("product") ?? "";
  const productId = UUID.test(rawProduct) ? rawProduct : "";
  const type = MOVEMENT_TYPES[params.get("type")] ? params.get("type") : "";
  const from = isDateParam(params.get("from")) ? params.get("from") : "";
  const to = isDateParam(params.get("to")) ? params.get("to") : "";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value == null) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  }

  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebounced(search, 300);
  useEffect(() => {
    if (debouncedSearch.trim() !== q) update({ q: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Name for the "one product" chip.
  const [productName, setProductName] = useState("");
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    getProductName(businessId, productId).then(({ data }) => {
      if (!cancelled) setProductName(data?.name ?? "this product");
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, productId]);

  const [state, setState] = useState({
    loading: true,
    rows: [],
    total: 0,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    listMovements({ businessId, productId, q, type, from, to, page }).then(
      (result) => {
        if (!cancelled) setState({ loading: false, ...result });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [businessId, productId, q, type, from, to, page]);

  const filtered = Boolean(q || productId || type || from || to);

  function clearFilters() {
    setSearch("");
    setParams({ tab: "movements" }, { replace: true });
  }

  return (
    <>
      <section className="card toolbar">
        <div className="toolbar__top">
          <div className="toolbar__search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              type="search"
              aria-label="Search movements by product"
              placeholder="Search product name or SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {productId && (
            <div className="filter-chip">
              <span>
                Product: <strong>{productName || "…"}</strong>
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={() => update({ product: "" })}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="toolbar__filters toolbar__filters--3">
          <Field
            as="select"
            label="Type"
            value={type}
            onChange={(e) => update({ type: e.target.value })}
          >
            <option value="">All types</option>
            {Object.entries(MOVEMENT_TYPES).map(([key, t]) => (
              <option key={key} value={key}>
                {t.label}
              </option>
            ))}
          </Field>
          <Field
            label="From"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => update({ from: e.target.value })}
          />
          <Field
            label="To"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => update({ to: e.target.value })}
          />
        </div>
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load movements: {state.error}{" "}
            {page > 1 && (
              <button
                type="button"
                className="link-btn"
                onClick={() => update({ page: "" })}
              >
                Back to page 1
              </button>
            )}
          </div>
        ) : state.loading && state.rows.length === 0 ? (
          <div className="empty">
            <div className="spinner" style={{ margin: "0 auto" }} />
          </div>
        ) : state.total === 0 ? (
          <div className="empty">
            <h2 className="card__title">
              {filtered
                ? "No movements match your filters"
                : "No stock movements yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search, type or date range."
                : "Every change to your stock will be listed here."}
            </p>
            {filtered && (
              <div
                className="kit-row"
                style={{
                  justifyContent: "center",
                  marginTop: "var(--space-4)",
                }}
              >
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Type</th>
                    <th className="num">Change</th>
                    <th className="num">Balance after</th>
                    <th>When</th>
                    <th>Note</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((m) => {
                    const change = Number(m.quantity_change);
                    return (
                      <tr key={m.id}>
                        <td className="cell-main">
                          <div className="product-cell__name">
                            {m.product_name}{" "}
                            {m.product_deleted_at && (
                              <span className="badge badge--danger">
                                Deleted
                              </span>
                            )}
                          </div>
                          <div className="product-cell__sub">
                            {m.product_sku || "No SKU"}
                          </div>
                        </td>
                        <td data-label="Type">
                          <span className="type-cell">
                            <MovementTypeBadge type={m.movement_type} />
                            {m.unit_cost != null && (
                              <span className="product-cell__sub">
                                at {formatMoney(m.unit_cost, symbol)} each
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="num" data-label="Change">
                          <span className={change > 0 ? "qty--in" : "qty--out"}>
                            {change > 0 ? "+" : ""}
                            {formatQty(change)} {m.product_unit}
                          </span>
                        </td>
                        <td className="num" data-label="Balance after">
                          {formatQty(m.balance_after)} {m.product_unit}
                        </td>
                        <td data-label="When">
                          {formatDateTime(m.created_at)}
                        </td>
                        <td className="cell-wrap" data-label="Note">
                          {m.note || "—"}
                        </td>
                        <td className="cell-wrap" data-label="By">
                          {m.created_by_name ||
                            (m.created_by ? "Former member" : "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              total={state.total}
              onPage={(n) => update({ page: n > 1 ? String(n) : "" })}
            />
          </>
        )}
      </section>
    </>
  );
}
