import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Paperclip, Plus, Search, Tags } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import SortHeader from "../../components/reports/SortHeader";
import ExportButton from "../../components/reports/ExportButton";
import MonthPicker from "../../components/layout/MonthPicker";
import ExpenseSummary from "../../components/expenses/ExpenseSummary";
import ExpenseModal from "../../components/expenses/ExpenseModal";
import VoidExpenseModal from "../../components/expenses/VoidExpenseModal";
import { useAuth } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { useDebounced } from "../../hooks/useDebounced";
import { listCategoryFilterOptions } from "../../data/expenseCategories";
import {
  EXPENSE_SORTS,
  EXPENSE_STATUSES,
  dayBefore,
  expenseTotals,
  formatExpenseDate,
  listExpenses,
} from "../../data/expenses";
import { PAYMENT_METHODS } from "../../data/sales";
import { formatDateTime, formatMoney } from "../../lib/format";
import { csvDate, csvDateTime, csvMoney } from "../../lib/csv";
import { todayInLagos } from "../../lib/analytics";
import { getReceiptUrl } from "../../lib/receipts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v) => DATE_RE.test(v ?? "") && !Number.isNaN(Date.parse(v));
const METHOD_LABEL = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

// Which sort keys each sortable column heading sets (same keys as the "Sort by" menu).
const DATE_KEYS = [
  { key: "newest", dir: "desc" },
  { key: "oldest", dir: "asc" },
];
const AMOUNT_KEYS = [
  { key: "amount_desc", dir: "desc" },
  { key: "amount_asc", dir: "asc" },
];

// "2026-11" -> "November 2026"
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
}

export default function ExpensesPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canManage = can("expenses.manage");
  const canExport = can("reports.view");
  const period = usePeriod();

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const rawCategory = params.get("category") ?? "";
  const category = UUID.test(rawCategory) ? rawCategory : "";
  const rawStatus = params.get("status");
  const status = EXPENSE_STATUSES.includes(rawStatus) ? rawStatus : "active";
  const from = validDate(params.get("from")) ? params.get("from") : "";
  const to = validDate(params.get("to")) ? params.get("to") : "";
  const rawSort = params.get("sort");
  const sort = EXPENSE_SORTS[rawSort] ? rawSort : "newest";
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

  const [reload, setReload] = useState(0);
  // A modal is only mounted while open, so its form always starts fresh.
  const [editing, setEditing] = useState(null); // { expense: row | null } while open
  const [voiding, setVoiding] = useState(null); // expense row while open
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(null);

  // Category filter options (every category, including inactive ones).
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listCategoryFilterOptions(businessId).then(({ rows }) => {
      if (!cancelled) setCategories(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // The list.
  const [state, setState] = useState({
    loading: true,
    rows: [],
    total: 0,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    listExpenses({
      businessId,
      q,
      categoryId: category,
      status,
      from,
      to,
      sort,
      page,
    }).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, q, category, status, from, to, sort, page, reload]);

  // The summary follows the From/To dates when either is set, otherwise the month picker.
  const customRange = Boolean(from || to);
  const summaryFrom = customRange ? from : period.from;
  const summaryTo = customRange ? to : dayBefore(period.to); // the picker's end is exclusive
  let summaryLabel = monthLabel(period.month);
  if (customRange) {
    summaryLabel =
      from && to
        ? `${formatExpenseDate(from)} to ${formatExpenseDate(to)}`
        : from
          ? `from ${formatExpenseDate(from)}`
          : `up to ${formatExpenseDate(to)}`;
  }
  const summaryHint = customRange
    ? "Following your From and To dates."
    : "Pick a month here, or set From and To below to use your own dates.";
  const summaryAction = customRange ? (
    <button
      type="button"
      className="btn btn--secondary btn--sm"
      onClick={() => update({ from: "", to: "" })}
    >
      Use the month picker
    </button>
  ) : (
    <MonthPicker />
  );

  const [totals, setTotals] = useState({
    loading: true,
    rows: [],
    grand: 0,
    count: 0,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setTotals((s) => ({ ...s, loading: true, error: "" }));
    expenseTotals({
      businessId,
      from: summaryFrom,
      to: summaryTo,
    }).then((result) => {
      if (!cancelled) setTotals({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, summaryFrom, summaryTo, reload]);

  const filtered = Boolean(q || category || status !== "active" || from || to);
  const badRange = Boolean(from && to && from > to);

  function clearFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  const changeSort = (key) =>
    update({ sort: !key || key === "newest" ? "" : key });

  const exportColumns = useMemo(
    () => [
      { header: "Date", value: (e) => csvDate(e.expense_date) },
      { header: "Category", value: (e) => e.category_name },
      { header: "Description", value: (e) => e.description },
      { header: "Vendor", value: (e) => e.vendor },
      { header: "Payment method", value: (e) => e.payment_method },
      { header: `Amount (${symbol})`, value: (e) => csvMoney(e.amount) },
      { header: "Status", value: (e) => (e.is_voided ? "Voided" : "Active") },
      { header: "Void reason", value: (e) => e.void_reason },
      { header: "Recorded by", value: (e) => e.created_by_name },
      { header: "Recorded at", value: (e) => csvDateTime(e.created_at) },
    ],
    [symbol],
  );
  const fetchExportPage = (pg, pageSize) =>
    listExpenses({
      businessId,
      q,
      categoryId: category,
      status,
      from,
      to,
      sort,
      page: pg,
      pageSize,
    });

  function afterChange(message) {
    setEditing(null);
    setVoiding(null);
    setActionError("");
    setNotice(message);
    setReload((n) => n + 1);
  }

  // Open the window during the click (so pop-up blockers allow it), then point it at
  // the fresh signed link once that arrives.
  async function openReceipt(expense) {
    setActionError("");
    const win = window.open("", "_blank");
    setReceiptBusy(expense.id);
    const { url, error } = await getReceiptUrl(expense.receipt_path);
    setReceiptBusy(null);
    if (!url) {
      win?.close();
      setActionError(error || "Could not open the receipt.");
      return;
    }
    if (!win) {
      setActionError(
        "Your browser blocked the receipt window. Allow pop-ups for this site and try again.",
      );
      return;
    }
    win.opener = null;
    win.location.href = url;
  }

  return (
    <>
      <PageHeader title="Expenses" subtitle="Where your money goes" />

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

      {canManage && editing && (
        <ExpenseModal
          open
          onClose={() => setEditing(null)}
          businessId={businessId}
          symbol={symbol}
          expense={editing.expense}
          onSaved={afterChange}
        />
      )}
      {canManage && voiding && (
        <VoidExpenseModal
          open
          onClose={() => setVoiding(null)}
          businessId={businessId}
          symbol={symbol}
          expense={voiding}
          onDone={afterChange}
        />
      )}

      <ExpenseSummary
        state={totals}
        label={summaryLabel}
        hint={summaryHint}
        action={summaryAction}
        symbol={symbol}
      />

      <section className="card toolbar">
        <div className="toolbar__top">
          <div className="toolbar__search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              type="search"
              aria-label="Search expenses"
              placeholder="Search description, vendor or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar__actions">
            {canExport && (
              <ExportButton
                filename={`ledgerly-expenses-${todayInLagos()}.csv`}
                columns={exportColumns}
                fetchPage={fetchExportPage}
                disabled={state.total === 0}
              />
            )}
            {canManage && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setEditing({ expense: null })}
              >
                <Plus size={16} aria-hidden="true" /> Add expense
              </button>
            )}
            <Link to="/expenses/categories" className="btn btn--secondary">
              <Tags size={16} aria-hidden="true" /> Manage categories
            </Link>
          </div>
        </div>

        <div className="toolbar__filters toolbar__filters--expenses">
          <Field
            as="select"
            label="Category"
            value={category}
            onChange={(e) => update({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {category && !categories.some((c) => c.id === category) && (
              <option value={category}>Selected category</option>
            )}
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
            onChange={(e) =>
              update({
                status: e.target.value === "active" ? "" : e.target.value,
              })
            }
          >
            <option value="active">Active</option>
            <option value="voided">Voided</option>
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
            {Object.entries(EXPENSE_SORTS).map(([key, s]) => (
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
        </div>
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load expenses: {state.error}{" "}
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
              {filtered ? "No expenses match your filters" : "No expenses yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search, a wider date range, or clear the filters."
                : canManage
                  ? "Expenses you record will appear here, sorted by date."
                  : "Expenses will appear here once they are recorded."}
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
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setEditing({ expense: null })}
                >
                  Add expense
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
                    <th>Expense</th>
                    <th>Category</th>
                    <SortHeader
                      label="Date"
                      keys={DATE_KEYS}
                      current={sort}
                      onSort={changeSort}
                    />
                    <th>Method</th>
                    <th>Receipt</th>
                    <SortHeader
                      label="Amount"
                      className="num"
                      keys={AMOUNT_KEYS}
                      current={sort}
                      onSort={changeSort}
                    />
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((e) => (
                    <tr key={e.id} className={e.is_voided ? "is-inactive" : ""}>
                      <td className="cell-main">
                        <div className="expense-cell">
                          <div className="expense-cell__name">
                            {e.description || "No description"}
                          </div>
                          {e.vendor && (
                            <div className="expense-cell__sub">{e.vendor}</div>
                          )}
                          {e.is_voided && (
                            <>
                              <div className="expense-cell__sub">
                                <span className="badge badge--danger">
                                  Voided
                                </span>{" "}
                                {formatDateTime(e.voided_at)}
                                {e.voided_by_name
                                  ? ` by ${e.voided_by_name}`
                                  : ""}
                              </div>
                              <div className="expense-cell__sub">
                                Reason: {e.void_reason}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="cell-wrap" data-label="Category">
                        {e.category_name}
                      </td>
                      <td data-label="Date">
                        {formatExpenseDate(e.expense_date)}
                      </td>
                      <td data-label="Method">
                        {METHOD_LABEL[e.payment_method] ?? "—"}
                      </td>
                      <td data-label="Receipt">
                        {e.receipt_path ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={receiptBusy === e.id}
                            onClick={() => openReceipt(e)}
                          >
                            <Paperclip size={14} aria-hidden="true" />{" "}
                            {receiptBusy === e.id ? "Opening…" : "View"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num" data-label="Amount">
                        <span className="expense-amount">
                          {formatMoney(e.amount, symbol)}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          {e.is_voided ? (
                            "—"
                          ) : (
                            <div className="row-actions">
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setEditing({ expense: e })}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setVoiding(e)}
                              >
                                Void
                              </button>
                            </div>
                          )}
                        </td>
                      )}
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
    </>
  );
}
