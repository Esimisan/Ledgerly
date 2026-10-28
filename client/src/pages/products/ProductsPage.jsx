import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { Plus, Search, Tags } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import ProductThumb from "../../components/products/ProductThumb";
import CategoriesModal from "../../components/products/CategoriesModal";
import { useAuth } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { useDebounced } from "../../hooks/useDebounced";
import { useImageUrls } from "../../hooks/useImageUrls";
import { listProducts, PAGE_SIZE, SORTS } from "../../data/products";
import { formatMoney, formatQty } from "../../lib/format";

export default function ProductsPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canWrite = can("products.write");

  // One-time message passed from the edit page after a delete. The history state is cleared straight away so the message doesn't come back when the page is refreshed.
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(() => location.state?.notice ?? "");
  useEffect(() => {
    if (location.state?.notice)
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const cat = params.get("cat") ?? "";
  const status = params.get("status") ?? "active";
  const stock = params.get("stock") ?? "all";
  const sort = SORTS[params.get("sort")] ? params.get("sort") : "name";
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

  // Search box: type freely, the URL (and the request) updates after a short pause.
  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebounced(search, 300);
  useEffect(() => {
    if (debouncedSearch.trim() !== q) update({ q: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { categories, reload: reloadCategories } = useCategories();
  const catNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const [catsOpen, setCatsOpen] = useState(false);

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
  }, [businessId, q, cat, status, stock, sort, page]);

  const urls = useImageUrls(state.rows.map((r) => r.image_path));

  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const first = state.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, state.total);
  const filtered = Boolean(q || cat || stock !== "all" || status !== "active");

  function clearFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Your catalogue: what you sell, and what it costs"
      />

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
          {canWrite && (
            <div className="toolbar__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setCatsOpen(true)}
              >
                <Tags size={16} aria-hidden="true" /> Categories
              </button>
              <Link to="/products/new" className="btn btn--primary">
                <Plus size={16} aria-hidden="true" /> Add product
              </Link>
            </div>
          )}
        </div>

        <div className="toolbar__filters">
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
            label="Stock"
            value={stock}
            onChange={(e) => update({ stock: e.target.value })}
          >
            <option value="all">All stock levels</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Field>
          <Field
            as="select"
            label="Sort by"
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </Field>
        </div>
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load products: {state.error}{" "}
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
                : canWrite
                  ? "Add your first product to start building your catalogue."
                  : "Products will appear here once they are added."}
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
              {!filtered && canWrite && (
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
                    <th>Category</th>
                    <th className="num">Cost</th>
                    <th className="num">Price</th>
                    <th className="num">In stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((r) => (
                    <tr key={r.id} className={r.is_active ? "" : "is-inactive"}>
                      <td className="cell-main">
                        <div className="product-cell">
                          <ProductThumb url={urls[r.image_path]} />
                          <div>
                            {canWrite ? (
                              <Link
                                className="product-cell__name"
                                to={`/products/${r.id}/edit`}
                              >
                                {r.name}
                              </Link>
                            ) : (
                              <span className="product-cell__name">
                                {r.name}
                              </span>
                            )}
                            <div className="product-cell__sub">
                              {r.sku || "No SKU"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Category">
                        {catNames.get(r.category_id) ?? "—"}
                      </td>
                      <td className="num" data-label="Cost">
                        {formatMoney(r.cost_price, symbol)}
                      </td>
                      <td className="num" data-label="Price">
                        {formatMoney(r.selling_price, symbol)}
                      </td>
                      <td className="num" data-label="In stock">
                        <span>
                          {formatQty(r.quantity_on_hand)} {r.unit}{" "}
                          {r.stock_status === "out" && (
                            <span className="badge badge--danger">Out</span>
                          )}
                          {r.stock_status === "low" && (
                            <span className="badge badge--warning">Low</span>
                          )}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${r.is_active ? "badge--success" : ""}`}
                        >
                          {r.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                Showing {first}–{last} of {state.total}
              </span>
              <div className="pagination__buttons">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={page <= 1}
                  onClick={() =>
                    update({ page: page - 1 > 1 ? String(page - 1) : "" })
                  }
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={page >= pages}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {canWrite && (
        <CategoriesModal
          open={catsOpen}
          onClose={() => setCatsOpen(false)}
          businessId={businessId}
          categories={categories}
          onChanged={reloadCategories}
        />
      )}
    </>
  );
}
