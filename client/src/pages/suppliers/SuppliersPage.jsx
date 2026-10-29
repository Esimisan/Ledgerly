import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import SupplierModal from "../../components/suppliers/SupplierModal";
import DeactivateSupplierModal from "../../components/suppliers/DeactivateSupplierModal";
import { useAuth } from "../../context/AuthContext";
import { useDebounced } from "../../hooks/useDebounced";
import { PAGE_SIZE } from "../../data/products";
import {
  listSuppliers,
  setSupplierActive,
  supplierError,
} from "../../data/suppliers";

const STATUSES = ["active", "inactive", "all"];

export default function SuppliersPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const canManage = can("suppliers.manage");

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = STATUSES.includes(rawStatus) ? rawStatus : "active";
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

  // Modal state. A modal is only mounted while open, so its form always starts fresh.
  const [editing, setEditing] = useState(null); // { supplier: row | null } while open
  const [deactivating, setDeactivating] = useState(null); // supplier row while open
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
    listSuppliers({ businessId, q, status, page }).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, q, status, page, reload]);

  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const first = state.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, state.total);
  const filtered = Boolean(q || status !== "active");

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

  async function reactivate(s) {
    setActionError("");
    setBusyId(s.id);
    const { error } = await setSupplierActive(s.id, businessId, true);
    setBusyId(null);
    if (error) {
      setActionError(supplierError(error));
      return;
    }
    afterChange(`${s.name} was reactivated.`);
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="The businesses you buy your stock from"
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
              aria-label="Search suppliers"
              placeholder="Search name, contact or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canManage && (
            <div className="toolbar__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setEditing({ supplier: null })}
              >
                <Plus size={16} aria-hidden="true" /> Add supplier
              </button>
            </div>
          )}
        </div>

        <div className="toolbar__filters">
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
        </div>
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load suppliers: {state.error}{" "}
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
                ? "No suppliers match your filters"
                : "No suppliers yet"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Try a different search or clear the filters."
                : canManage
                  ? "Add the businesses you buy from, then link them to your products."
                  : "Suppliers will appear here once they are added."}
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
                  onClick={() => setEditing({ supplier: null })}
                >
                  Add supplier
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
                    <th>Supplier</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Status</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((s) => (
                    <tr key={s.id} className={s.is_active ? "" : "is-inactive"}>
                      <td className="cell-main">
                        <div className="supplier-cell">
                          <div className="supplier-cell__name">{s.name}</div>
                          {s.contact_name && (
                            <div className="supplier-cell__sub">
                              {s.contact_name}
                            </div>
                          )}
                        </div>
                      </td>
                      <td data-label="Phone">{s.phone || "—"}</td>
                      <td className="cell-wrap" data-label="Email">
                        {s.email || "—"}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${s.is_active ? "badge--success" : "badge--warning"}`}
                        >
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setEditing({ supplier: s })}
                            >
                              Edit
                            </button>
                            {s.is_active ? (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setDeactivating(s)}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                disabled={busyId === s.id}
                                onClick={() => reactivate(s)}
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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

      {canManage && editing && (
        <SupplierModal
          open
          onClose={() => setEditing(null)}
          businessId={businessId}
          supplier={editing.supplier}
          onSaved={afterChange}
        />
      )}
      {canManage && deactivating && (
        <DeactivateSupplierModal
          open
          onClose={() => setDeactivating(null)}
          businessId={businessId}
          supplier={deactivating}
          onDone={afterChange}
        />
      )}
    </>
  );
}
