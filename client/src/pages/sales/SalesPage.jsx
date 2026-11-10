import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import SortHeader from "../../components/reports/SortHeader";
import ExportButton from "../../components/reports/ExportButton";
import {
  PaymentBadge,
  SaleStatusBadge,
} from "../../components/sales/SaleBadges";
import { useAuth } from "../../context/AuthContext";
import { useDebounced } from "../../hooks/useDebounced";
import { getCustomer } from "../../data/customers";
import { SALE_SORTS, listSales } from "../../data/sales";
import { formatDateTime, formatMoney } from "../../lib/format";
import { csvDateTime, csvMoney } from "../../lib/csv";
import { todayInLagos } from "../../lib/analytics";

const STATUSES = ["all", "completed", "voided"];

// Which sort keys each sortable column heading sets (same keys as the "Sort by" menu).
const DATE_KEYS = [
  { key: "newest", dir: "desc" },
  { key: "oldest", dir: "asc" },
];
const TOTAL_KEYS = [
  { key: "total_desc", dir: "desc" },
  { key: "total_asc", dir: "asc" },
];
const OWED_KEYS = [{ key: "owed_desc", dir: "desc" }];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v) => DATE_RE.test(v ?? "") && !Number.isNaN(Date.parse(v));

export default function SalesPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canCreate = can("sales.create");
  const canExport = can("reports.view");

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = STATUSES.includes(rawStatus) ? rawStatus : "all";
  const rawCustomer = params.get("customer") ?? "";
  const customer =
    rawCustomer === "walkin" || UUID.test(rawCustomer) ? rawCustomer : "";
  const from = validDate(params.get("from")) ? params.get("from") : "";
  const to = validDate(params.get("to")) ? params.get("to") : "";
  const unpaid = params.get("unpaid") === "1";
  const rawSort = params.get("sort");
  const sort = SALE_SORTS[rawSort] ? rawSort : "newest";
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

  // When the URL names one customer (for example from their profile), look up the
  // name so the filter can say who it is.
  const [customerName, setCustomerName] = useState("");
  useEffect(() => {
    if (!UUID.test(customer)) return;
    let cancelled = false;
    getCustomer(businessId, customer).then(({ data }) => {
      if (!cancelled) setCustomerName(data?.name ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, customer]);

  const [state, setState] = useState({
    loading: true,
    rows: [],
    total: 0,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    listSales({
      businessId,
      q,
      status,
      from,
      to,
      customerId: customer,
      unpaid,
      sort,
      page,
    }).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, q, status, from, to, customer, unpaid, sort, page]);

  const filtered = Boolean(
    q || status !== "all" || customer || from || to || unpaid,
  );
  const badRange = Boolean(from && to && from > to);

  function clearFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  const changeSort = (key) =>
    update({ sort: !key || key === "newest" ? "" : key });

  // CSV of exactly what the filters show (never the cost columns).
  const exportColumns = useMemo(
    () => [
      { header: "Sale number", value: (s) => s.sale_number },
      { header: "Date and time", value: (s) => csvDateTime(s.sold_at) },
      {
        header: "Customer",
        value: (s) => (s.customer_id ? s.customer_name : "Walk-in"),
      },
      { header: "Status", value: (s) => s.status },
      { header: "Products", value: (s) => s.item_count },
      { header: `Total (${symbol})`, value: (s) => csvMoney(s.total) },
      { header: `Paid (${symbol})`, value: (s) => csvMoney(s.amount_paid) },
      {
        header: `Still owed (${symbol})`,
        value: (s) => csvMoney(s.amount_outstanding),
      },
      {
        header: `Refunded (${symbol})`,
        value: (s) => csvMoney(s.refunded_total),
      },
      { header: "Returns", value: (s) => s.return_count },
      { header: "Payment method", value: (s) => s.payment_method },
    ],
    [symbol],
  );
  const fetchExportPage = (pg, pageSize) =>
    listSales({
      businessId,
      q,
      status,
      from,
      to,
      customerId: customer,
      unpaid,
      sort,
      page: pg,
      pageSize,
    });

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Every sale, with its payments and returns"
      />

      <section className="card toolbar">
        <div className="toolbar__top">
          <div className="toolbar__search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              type="search"
              aria-label="Search sales"
              placeholder="Search sale number or customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(canCreate || canExport) && (
            <div className="toolbar__actions">
              {canExport && (
                <ExportButton
                  filename={`ledgerly-sales-${todayInLagos()}.csv`}
                  columns={exportColumns}
                  fetchPage={fetchExportPage}
                  disabled={state.total === 0}
                />
              )}
              {canCreate && (
                <Link to="/sales/new" className="btn btn--primary">
                  <Plus size={16} aria-hidden="true" /> New sale
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="toolbar__filters toolbar__filters--sales">
          <Field
            as="select"
            label="Status"
            value={status}
            onChange={(e) =>
              update({ status: e.target.value === "all" ? "" : e.target.value })
            }
          >
            <option value="all">All sales</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </Field>
          <Field
            as="select"
            label="Customer"
            value={customer}
            onChange={(e) => update({ customer: e.target.value })}
          >
            <option value="">All customers</option>
            <option value="walkin">Walk-in only</option>
            {UUID.test(customer) && (
              <option value={customer}>
                {customerName || "Selected customer"}
              </option>
            )}
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
            {Object.entries(SALE_SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
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
            error={
              badRange ? "The end date is before the start date." : undefined
            }
            onChange={(e) => update({ to: e.target.value })}
          />
          <label className="check filter-check">
            <input
              type="checkbox"
              checked={unpaid}
              onChange={(e) => update({ unpaid: e.target.checked ? "1" : "" })}
            />
            Money still owed
          </label>
        </div>
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load sales: {state.error}{" "}
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
              {filtered ? "No sales match your filters" : "No sales yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search, a wider date range, or clear the filters."
                : canCreate
                  ? "Record your first sale and it will appear here, with its receipt."
                  : "Sales will appear here once they are recorded."}
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
              {!filtered && canCreate && (
                <Link to="/sales/new" className="btn btn--primary">
                  New sale
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
                    <SortHeader
                      label="Sale"
                      keys={DATE_KEYS}
                      current={sort}
                      onSort={changeSort}
                    />
                    <th>Customer</th>
                    <th className="num">Products</th>
                    <SortHeader
                      label="Total"
                      className="num"
                      keys={TOTAL_KEYS}
                      current={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      label="Payment"
                      keys={OWED_KEYS}
                      current={sort}
                      onSort={changeSort}
                    />
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((s) => {
                    const refunded = Number(s.refunded_total);
                    return (
                      <tr
                        key={s.id}
                        className={s.status === "voided" ? "is-inactive" : ""}
                      >
                        <td className="cell-main">
                          <div className="sale-cell">
                            <Link
                              className="product-cell__name"
                              to={`/sales/${s.id}`}
                            >
                              {s.sale_label}
                            </Link>
                            <div className="product-cell__sub">
                              {formatDateTime(s.sold_at)}
                            </div>
                          </div>
                        </td>
                        <td className="cell-wrap" data-label="Customer">
                          {s.customer_id ? (
                            <Link to={`/customers/${s.customer_id}`}>
                              {s.customer_name || "Customer"}
                            </Link>
                          ) : (
                            "Walk-in"
                          )}
                        </td>
                        <td className="num" data-label="Products">
                          {s.item_count}
                        </td>
                        <td className="num" data-label="Total">
                          <span className="amount-stack">
                            <span>{formatMoney(s.total, symbol)}</span>
                            {refunded > 0 && (
                              <span className="product-cell__sub">
                                Refunded {formatMoney(refunded, symbol)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td data-label="Payment">
                          <PaymentBadge sale={s} symbol={symbol} />
                        </td>
                        <td data-label="Status">
                          <span className="badge-row">
                            <SaleStatusBadge status={s.status} />
                            {s.return_count > 0 && (
                              <span className="badge">
                                {s.return_count}{" "}
                                {s.return_count === 1 ? "return" : "returns"}
                              </span>
                            )}
                          </span>
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
