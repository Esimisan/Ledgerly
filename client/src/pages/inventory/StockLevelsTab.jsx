import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import ProductThumb from "../../components/products/ProductThumb";
import StockActionModal from "../../components/inventory/StockActionModal";
import { StockStatusBadge } from "../../components/inventory/Badges";
import { useAuth } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { useDebounced } from "../../hooks/useDebounced";
import { useImageUrls } from "../../hooks/useImageUrls";
import { listProducts, SORTS } from "../../data/products";
import { getStockSummary } from "../../data/stock";
import { formatMoney, formatQty } from "../../lib/format";

const SORT_KEYS = ["name", "stock_asc", "stock_desc"];

export default function StockLevelsTab() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canAdjust = can("inventory.adjust");
  const canAddProducts = can("products.write");

  // List state lives in the URL (the tab itself is ?tab=...; update() keeps it).
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const cat = params.get("cat") ?? "";
  const status = params.get("status") ?? "active";
  const stock = ["low", "out"].includes(params.get("stock"))
    ? params.get("stock")
    : "all";
  const sort = SORT_KEYS.includes(params.get("sort"))
    ? params.get("sort")
    : "name";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value == null) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page"); // any filter change returns to page 1
    setParams(next, { replace: true });
  }

  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebounced(search, 300);
  useEffect(() => {
    if (debouncedSearch.trim() !== q) update({ q: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { categories } = useCategories();
  const [acting, setActing] = useState(null); // product row while the modal is open
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [summary, setSummary] = useState({ all: null, low: null, out: null });

  const [state, setState] = useState({
    loading: true,
    rows: [],
    total: 0,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    listProducts({
      businessId,
      q,
      categoryId: cat,
      status,
      stock,
      sort,
      page,
    }).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, q, cat, status, stock, sort, page, reload]);

  useEffect(() => {
    let cancelled = false;
    getStockSummary(businessId).then((s) => {
      if (!cancelled) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, reload]);

  const urls = useImageUrls(state.rows.map((r) => r.image_path));
  const catNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const filtered = Boolean(q || cat || stock !== "all" || status !== "active");

  function clearFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  function afterChange(message) {
    setActing(null);
    setNotice(message);
    setReload((n) => n + 1);
  }

  return (
    <>
      {notice && (
        <div className="alert alert--success" role="status">
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

      <section className="card toolbar">
        <div className="toolbar__top">
          <div className="toolbar__search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              type="search"
              aria-label="Search products"
              placeholder="Search name, SKU or barcode"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div
            className="segmented segmented--fit"
            role="radiogroup"
            aria-label="Stock level"
          >
            {[
              ["all", "All", summary.all],
              ["low", "Low", summary.low],
              ["out", "Out", summary.out],
            ].map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={stock === key}
                onClick={() => update({ stock: key === "all" ? "" : key })}
              >
                {label}
                {n != null && <span className="chip-count">{n}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar__filters toolbar__filters--3">
          <Field
            as="select"
            label="Category"
            value={cat}
            onChange={(e) => update({ cat: e.target.value })}
          >
            <option value="">All categories</option>
            <option value="none">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </Field>
          <Field
            as="select"
            label="Status"
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Field>
          <Field
            as="select"
            label="Sort by"
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORTS[key].label}
              </option>
            ))}
          </Field>
        </div>
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load stock levels: {state.error}{" "}
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
              {filtered ? "No products match your filters" : "No products yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search or clear the filters."
                : "Add products first, then record their stock here."}
            </p>
            <div
              className="kit-row"
              style={{ justifyContent: "center", marginTop: "var(--space-4)" }}
            >
              {filtered && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}
              {!filtered && canAddProducts && (
                <Link to="/products/new" className="btn btn--primary">
                  Add product
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">In stock</th>
                    <th className="num">Low-stock level</th>
                    <th className="num">Stock value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((r) => (
                    <tr key={r.id} className={r.is_active ? "" : "is-inactive"}>
                      <td className="cell-main">
                        <div className="product-cell">
                          <ProductThumb url={urls[r.image_path]} />
                          <div>
                            <span className="product-cell__name">{r.name}</span>
                            <div className="product-cell__sub">
                              {r.sku || "No SKU"}
                              {catNames.get(r.category_id)
                                ? ` · ${catNames.get(r.category_id)}`
                                : ""}
                              {r.is_active ? "" : " · Inactive"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num" data-label="In stock">
                        <span>
                          {formatQty(r.quantity_on_hand)} {r.unit}{" "}
                          <StockStatusBadge status={r.stock_status} />
                        </span>
                      </td>
                      <td className="num" data-label="Low-stock level">
                        {Number(r.min_stock_level) > 0
                          ? formatQty(r.min_stock_level)
                          : "—"}
                      </td>
                      <td className="num" data-label="Stock value">
                        {formatMoney(
                          Number(r.quantity_on_hand) * Number(r.cost_price),
                          symbol,
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {canAdjust && r.is_active && (
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => setActing(r)}
                            >
                              Update stock
                            </button>
                          )}
                          <Link
                            className="btn btn--ghost btn--sm"
                            to={`/inventory?tab=movements&product=${r.id}`}
                          >
                            History
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
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

      {canAdjust && acting && (
        <StockActionModal
          open
          onClose={() => setActing(null)}
          businessId={businessId}
          product={acting}
          symbol={symbol}
          onDone={afterChange}
        />
      )}
    </>
  );
}
