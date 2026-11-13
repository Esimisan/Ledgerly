import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import { PoStatusBadge } from "../../components/purchases/PoBadges";
import { useAuth } from "../../context/AuthContext";
import { useDebounced } from "../../hooks/useDebounced";
import { useListQuery } from "../../hooks/useListQuery";
import { formatExpenseDate, todayLocal } from "../../data/expenses";
import { isDateParam } from "../../data/stock";
import {
  PO_SORTS,
  PO_STATUS_FILTERS,
  listPurchaseOrders,
  listSupplierFilterOptions,
} from "../../data/purchaseOrders";
import { formatMoney, formatQty } from "../../lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_KEYS = PO_STATUS_FILTERS.map(([key]) => key);
const INITIAL_LIST = { rows: [], total: 0, error: "" };

export default function PurchaseOrdersPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canManage = can("purchases.manage");

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = STATUS_KEYS.includes(rawStatus) ? rawStatus : "all";
  const rawSupplier = params.get("supplier") ?? "";
  const supplier = UUID.test(rawSupplier) ? rawSupplier : "";
  const from = isDateParam(params.get("from")) ? params.get("from") : "";
  const to = isDateParam(params.get("to")) ? params.get("to") : "";
  const rawSort = params.get("sort");
  const sort = PO_SORTS[rawSort] ? rawSort : "newest";
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

  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listSupplierFilterOptions(businessId).then(({ rows }) => {
      if (!cancelled) setSuppliers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const state = useListQuery(
    listPurchaseOrders,
    { businessId, q, status, supplierId: supplier, from, to, sort, page },
    INITIAL_LIST,
  );

  const filtered = Boolean(q || status !== "all" || supplier || from || to);
  const badRange = Boolean(from && to && from > to);
  const today = todayLocal();

  function clearFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Purchase orders"
        subtitle="What you have ordered from your suppliers, and what has arrived"
      />

      <section className="card toolbar">
        <div className="toolbar__top">
          <div className="toolbar__search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              type="search"
              aria-label="Search purchase orders"
              placeholder="Search order number or supplier"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canManage && (
            <div className="toolbar__actions">
              <Link
                to="/inventory/purchase-orders/new"
                className="btn btn--primary"
              >
                <Plus size={16} aria-hidden="true" /> New purchase order
              </Link>
            </div>
          )}
        </div>

        <div className="toolbar__filters toolbar__filters--po">
          <Field
            as="select"
            label="Status"
            value={status}
            onChange={(e) =>
              update({ status: e.target.value === "all" ? "" : e.target.value })
            }
          >
            {PO_STATUS_FILTERS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Field>
          <Field
            as="select"
            label="Supplier"
            value={supplier}
            onChange={(e) => update({ supplier: e.target.value })}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_active ? "" : " (inactive)"}
              </option>
            ))}
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
            {Object.entries(PO_SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </Field>
          <Field
            label="Created from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => update({ from: e.target.value })}
          />
          <Field
            label="Created to"
            type="date"
            value={to}
            min={from || undefined}
            error={
              badRange ? "The end date is before the start date." : undefined
            }
            onChange={(e) => update({ to: e.target.value })}
          />
        </div>
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load purchase orders: {state.error}{" "}
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
                ? "No purchase orders match your filters"
                : "No purchase orders yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search, a wider date range, or clear the filters."
                : "Create an order for a supplier, then receive the stock here when it arrives."}
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
              {!filtered && canManage && (
                <Link
                  to="/inventory/purchase-orders/new"
                  className="btn btn--primary"
                >
                  New purchase order
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
                    <th>Order</th>
                    <th>Supplier</th>
                    <th className="num">Lines</th>
                    <th className="num">Total</th>
                    <th>Received</th>
                    <th>Expected</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((po) => {
                    const ordered = Number(po.quantity_ordered_total);
                    const received = Number(po.quantity_received_total);
                    const pct =
                      ordered > 0
                        ? Math.min(100, Math.round((received / ordered) * 100))
                        : 0;
                    const showProgress =
                      po.status !== "draft" &&
                      (po.status !== "cancelled" || received > 0);
                    const overdue =
                      po.expected_date &&
                      po.expected_date < today &&
                      (po.status === "ordered" ||
                        po.status === "partially_received");
                    return (
                      <tr
                        key={po.id}
                        className={
                          po.status === "cancelled" ? "is-inactive" : ""
                        }
                      >
                        <td className="cell-main">
                          <div className="po-cell">
                            <Link
                              className="product-cell__name"
                              to={`/inventory/purchase-orders/${po.id}`}
                            >
                              {po.po_label}
                            </Link>
                            <div className="product-cell__sub">
                              {formatExpenseDate(po.created_at.slice(0, 10))}
                            </div>
                          </div>
                        </td>
                        <td className="cell-wrap" data-label="Supplier">
                          {po.supplier_name}
                        </td>
                        <td className="num" data-label="Lines">
                          {po.item_count}
                        </td>
                        <td className="num" data-label="Total">
                          {formatMoney(po.total, symbol)}
                        </td>
                        <td data-label="Received">
                          {showProgress ? (
                            <span className="amount-stack">
                              <span className="product-cell__sub">
                                {formatQty(received)} of {formatQty(ordered)}
                              </span>
                              <span className="progress">
                                <span className="progress__track">
                                  <span
                                    className="progress__bar"
                                    style={{ width: `${pct}%` }}
                                  />
                                </span>
                                <span className="progress__value">{pct}%</span>
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td data-label="Expected">
                          <span className="amount-stack">
                            <span>{formatExpenseDate(po.expected_date)}</span>
                            {overdue && (
                              <span className="line-warn">Overdue</span>
                            )}
                          </span>
                        </td>
                        <td data-label="Status">
                          <PoStatusBadge status={po.status} />
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
