import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import CategoryModal from "../../components/expenses/CategoryModal";
import { useAuth } from "../../context/AuthContext";
import {
  CATEGORY_STATUSES,
  categoryError,
  listExpenseCategories,
  setCategoryActive,
} from "../../data/expenseCategories";

export default function ExpenseCategoriesPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const canManage = can("expenses.manage");

  // List state lives in the URL, so back/forward and bookmarks work.
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status");
  const status = CATEGORY_STATUSES.includes(rawStatus) ? rawStatus : "active";
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

  // A modal is only mounted while open, so its form always starts fresh.
  const [editing, setEditing] = useState(null); // { category: row | null } while open
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
    listExpenseCategories({ businessId, status, page }).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, status, page, reload]);

  const filtered = status !== "active";

  function afterSave(message) {
    setEditing(null);
    setActionError("");
    setNotice(message);
    setReload((n) => n + 1);
  }

  async function toggleActive(category, makeActive) {
    setActionError("");
    setNotice("");
    setBusyId(category.id);
    const { error } = await setCategoryActive(
      category.id,
      businessId,
      makeActive,
    );
    setBusyId(null);
    if (error) {
      setActionError(categoryError(error));
      return;
    }
    setNotice(
      makeActive
        ? `${category.name} was reactivated.`
        : `${category.name} was deactivated. Past expenses keep it, and it no longer appears when adding new ones.`,
    );
    setReload((n) => n + 1);
  }

  return (
    <>
      <PageHeader
        title="Expense categories"
        subtitle="The groups your spending is sorted into"
      />

      <Link to="/expenses" className="back-link no-print">
        <ArrowLeft size={16} aria-hidden="true" /> Back to expenses
      </Link>

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

      <section className="card category-toolbar">
        <div className="category-toolbar__filter">
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
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Field>
        </div>
        {canManage && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setEditing({ category: null })}
          >
            <Plus size={16} aria-hidden="true" /> Add category
          </button>
        )}
      </section>

      <section className="card" aria-busy={state.loading}>
        {state.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load categories: {state.error}{" "}
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
              {filtered ? "No categories here" : "No active categories"}
            </h2>
            <p className="card__sub">
              {filtered
                ? "Nothing matches this status. Try another one."
                : canManage
                  ? "Add a category so new expenses can be sorted into it."
                  : "Categories will appear here once they are added."}
            </p>
            <div
              className="kit-row"
              style={{ justifyContent: "center", marginTop: "var(--space-4)" }}
            >
              {filtered && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => update({ status: "" })}
                >
                  Show active categories
                </button>
              )}
              {!filtered && canManage && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setEditing({ category: null })}
                >
                  Add category
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
                    <th>Category</th>
                    <th>Status</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((c) => (
                    <tr key={c.id} className={c.is_active ? "" : "is-inactive"}>
                      <td className="cell-main">
                        <div className="category-cell">
                          <span className="category-cell__name">{c.name}</span>
                          {c.is_system && (
                            <span className="badge">Default</span>
                          )}
                        </div>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${c.is_active ? "badge--success" : "badge--warning"}`}
                        >
                          {c.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setEditing({ category: c })}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busyId === c.id}
                              onClick={() => toggleActive(c, !c.is_active)}
                            >
                              {c.is_active ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
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

      {canManage && editing && (
        <CategoryModal
          open
          onClose={() => setEditing(null)}
          businessId={businessId}
          category={editing.category}
          onSaved={afterSave}
        />
      )}
    </>
  );
}
