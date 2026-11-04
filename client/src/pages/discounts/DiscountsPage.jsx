import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import DiscountModal from "../../components/discounts/DiscountModal";
import { useAuth } from "../../context/AuthContext";
import { useDebounced } from "../../hooks/useDebounced";
import {
  DISCOUNT_SORTS,
  discountError,
  discountStatus,
  listDiscounts,
  setDiscountActive,
} from "../../data/discounts";
import { formatDate, formatMoney } from "../../lib/format";

const STATUSES = ["active", "off", "all"];

function validText(d) {
  if (d.starts_at && d.ends_at)
    return `${formatDate(d.starts_at)} to ${formatDate(d.ends_at)}`;
  if (d.starts_at) return `From ${formatDate(d.starts_at)}`;
  if (d.ends_at) return `Until ${formatDate(d.ends_at)}`;
  return "Always";
}

export default function DiscountsPage() {
  const { business } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = STATUSES.includes(rawStatus) ? rawStatus : "active";
  const rawSort = params.get("sort");
  const sort = DISCOUNT_SORTS[rawSort] ? rawSort : "newest";
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

  // A modal is only mounted while open, so its form always starts fresh.
  const [editing, setEditing] = useState(null); // { discount: row | null } while open
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reload, setReload] = useState(0);

  const [state, setState] = useState({
    loading: true,
    rows: [],
    total: 0,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    listDiscounts({ businessId, q, status, sort, page }).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, q, status, sort, page, reload]);

  const filtered = Boolean(q || status !== "active");

  function clearFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  function afterChange(message) {
    setEditing(null);
    setNotice(message);
    setReload((n) => n + 1);
  }

  async function toggle(d, makeActive) {
    setActionError("");
    setBusyId(d.id);
    const { error } = await setDiscountActive(d.id, businessId, makeActive);
    setBusyId(null);
    if (error) {
      setActionError(discountError(error).message);
      return;
    }
    afterChange(`${d.name} was turned ${makeActive ? "on" : "off"}.`);
  }

  return (
    <>
      <PageHeader
        title="Discounts"
        subtitle="Promo codes your team can use when recording a sale"
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
      {actionError && (
        <div className="alert alert--danger" role="alert">
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

      <section className="card toolbar">
        <div className="toolbar__top">
          <div className="toolbar__search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              type="search"
              aria-label="Search promos"
              placeholder="Search name or code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setEditing({ discount: null })}
            >
              <Plus size={16} aria-hidden="true" /> Add promo
            </button>
          </div>
        </div>

        <div className="toolbar__filters toolbar__filters--discounts">
          <Field
            as="select"
            label="Status"
            value={status}
            onChange={(e) =>
              update({
                status: e.target.value === "active" ? "" : e.target.value,
              })
            }
          >
            <option value="active">On</option>
            <option value="off">Off</option>
            <option value="all">All</option>
          </Field>
          <Field
            as="select"
            label="Sort by"
            value={sort}
            onChange={(e) =>
              update({
                sort: e.target.value === "newest" ? "" : e.target.value,
              })
            }
          >
            {Object.entries(DISCOUNT_SORTS).map(([key, s]) => (
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
            Could not load promos: {state.error}{" "}
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
              {filtered ? "No promos match your filters" : "No promo codes yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search or clear the filters."
                : "Create a promo code to give a percentage or a fixed amount off a sale."}
            </p>
            <div
              className="kit-row"
              style={{ justifyContent: "center", marginTop: "var(--space-4)" }}
            >
              {filtered ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setEditing({ discount: null })}
                >
                  Add promo
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Promo</th>
                    <th className="num">Discount</th>
                    <th className="num">Minimum order</th>
                    <th>Valid</th>
                    <th className="num">Used</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((d) => {
                    const st = discountStatus(d);
                    const min = Number(d.min_order_amount);
                    return (
                      <tr
                        key={d.id}
                        className={d.is_active ? "" : "is-inactive"}
                      >
                        <td className="cell-main">
                          <div className="promo-cell">
                            <div className="product-cell__name">{d.name}</div>
                            {d.code && (
                              <span className="promo-code">{d.code}</span>
                            )}
                          </div>
                        </td>
                        <td className="num" data-label="Discount">
                          {d.discount_type === "percent"
                            ? `${Number(d.value)}% off`
                            : `${formatMoney(d.value, symbol)} off`}
                        </td>
                        <td className="num" data-label="Minimum order">
                          {min > 0 ? formatMoney(min, symbol) : "None"}
                        </td>
                        <td data-label="Valid">{validText(d)}</td>
                        <td className="num" data-label="Used">
                          {d.times_used}
                          {d.usage_limit != null ? ` / ${d.usage_limit}` : ""}
                        </td>
                        <td data-label="Status">
                          <span
                            className={`badge ${st.tone ? `badge--${st.tone}` : ""}`}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setEditing({ discount: d })}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busyId === d.id}
                              onClick={() => toggle(d, !d.is_active)}
                            >
                              {d.is_active ? "Turn off" : "Turn on"}
                            </button>
                          </div>
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

      {editing && (
        <DiscountModal
          open
          onClose={() => setEditing(null)}
          businessId={businessId}
          discount={editing.discount}
          symbol={symbol}
          onSaved={afterChange}
        />
      )}
    </>
  );
}
