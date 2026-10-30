import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import CustomerModal from "../../components/customers/CustomerModal";
import DeactivateCustomerModal from "../../components/customers/DeactivateCustomerModal";
import { useAuth } from "../../context/AuthContext";
import { useDebounced } from "../../hooks/useDebounced";
import {
  CUSTOMER_SORTS,
  customerError,
  listCustomers,
  setCustomerActive,
} from "../../data/customers";
import { formatDate, formatMoney } from "../../lib/format";

const STATUSES = ["active", "inactive", "all"];
const BALANCES = ["owes", "credit"];

export default function CustomersPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canWrite = can("customers.write");
  const canSetDiscount = can("discounts.manage");

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = STATUSES.includes(rawStatus) ? rawStatus : "active";
  const rawBalance = params.get("balance");
  const balance = BALANCES.includes(rawBalance) ? rawBalance : "";
  const rawSort = params.get("sort");
  const sort = CUSTOMER_SORTS[rawSort] ? rawSort : "name";
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
  const [editing, setEditing] = useState(null); // { customer: row | null } while open
  const [deactivating, setDeactivating] = useState(null); // customer row while open
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
    listCustomers({ businessId, q, status, balance, sort, page }).then(
      (result) => {
        if (!cancelled) setState({ loading: false, ...result });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [businessId, q, status, balance, sort, page, reload]);

  const filtered = Boolean(q || status !== "active" || balance);

  function clearFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  function afterChange(message) {
    setEditing(null);
    setDeactivating(null);
    setNotice(message);
    setReload((n) => n + 1);
  }

  async function reactivate(c) {
    setActionError("");
    setBusyId(c.id);
    const { error } = await setCustomerActive(c.id, businessId, true);
    setBusyId(null);
    if (error) {
      setActionError(customerError(error).message);
      return;
    }
    afterChange(`${c.name} was reactivated.`);
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="The people and businesses you sell to"
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
              aria-label="Search customers"
              placeholder="Search name, phone or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canWrite && (
            <div className="toolbar__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setEditing({ customer: null })}
              >
                <Plus size={16} aria-hidden="true" /> Add customer
              </button>
            </div>
          )}
        </div>

        <div className="toolbar__filters toolbar__filters--customers">
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
            label="Balance"
            value={balance}
            onChange={(e) => update({ balance: e.target.value })}
          >
            <option value="">Any balance</option>
            <option value="owes">Owes money</option>
            <option value="credit">Has store credit</option>
          </Field>
          <Field
            as="select"
            label="Sort by"
            value={sort}
            onChange={(e) =>
              update({ sort: e.target.value === "name" ? "" : e.target.value })
            }
          >
            {Object.entries(CUSTOMER_SORTS).map(([key, s]) => (
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
            Could not load customers: {state.error}{" "}
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
                ? "No customers match your filters"
                : "No customers yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search or clear the filters."
                : canWrite
                  ? "Add the people you sell to, so you can track their purchases and balances."
                  : "Customers will appear here once they are added."}
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
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setEditing({ customer: null })}
                >
                  Add customer
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
                    <th>Customer</th>
                    <th>Phone</th>
                    <th className="num">Discount</th>
                    <th className="num">Balance</th>
                    <th>Last purchase</th>
                    <th>Status</th>
                    {canWrite && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((c) => {
                    const bal = Number(c.balance);
                    return (
                      <tr
                        key={c.id}
                        className={c.is_active ? "" : "is-inactive"}
                      >
                        <td className="cell-main">
                          <div className="customer-cell">
                            <Link
                              className="product-cell__name"
                              to={`/customers/${c.id}`}
                            >
                              {c.name}
                            </Link>
                            {c.email && (
                              <div className="product-cell__sub cell-wrap">
                                {c.email}
                              </div>
                            )}
                          </div>
                        </td>
                        <td data-label="Phone">{c.phone || "—"}</td>
                        <td className="num" data-label="Discount">
                          {Number(c.discount_percent)}%
                        </td>
                        <td className="num" data-label="Balance">
                          {bal === 0 ? (
                            "—"
                          ) : bal > 0 ? (
                            <span className="balance--owes">
                              Owes {formatMoney(bal, symbol)}
                            </span>
                          ) : (
                            <span className="balance--credit">
                              Credit {formatMoney(Math.abs(bal), symbol)}
                            </span>
                          )}
                        </td>
                        <td data-label="Last purchase">
                          {c.last_purchase_at
                            ? formatDate(c.last_purchase_at)
                            : "Never"}
                        </td>
                        <td data-label="Status">
                          <span
                            className={`badge ${c.is_active ? "badge--success" : "badge--warning"}`}
                          >
                            {c.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        {canWrite && (
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setEditing({ customer: c })}
                              >
                                Edit
                              </button>
                              {c.is_active ? (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => setDeactivating(c)}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  disabled={busyId === c.id}
                                  onClick={() => reactivate(c)}
                                >
                                  Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        )}
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

      {canWrite && editing && (
        <CustomerModal
          open
          onClose={() => setEditing(null)}
          businessId={businessId}
          customer={editing.customer}
          canSetDiscount={canSetDiscount}
          onSaved={afterChange}
        />
      )}
      {canWrite && deactivating && (
        <DeactivateCustomerModal
          open
          onClose={() => setDeactivating(null)}
          businessId={businessId}
          customer={deactivating}
          symbol={symbol}
          onDone={afterChange}
        />
      )}
    </>
  );
}
