import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Banknote, Clock, ShoppingBag, Wallet } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Pagination from "../../components/ui/Pagination";
import BalanceText from "../../components/customers/BalanceText";
import CustomerModal from "../../components/customers/CustomerModal";
import DeactivateCustomerModal from "../../components/customers/DeactivateCustomerModal";
import RecordPaymentModal from "../../components/customers/RecordPaymentModal";
import AdjustBalanceModal from "../../components/customers/AdjustBalanceModal";
import { useAuth } from "../../context/AuthContext";
import { useListQuery } from "../../hooks/useListQuery";
import {
  customerError,
  getCustomer,
  LEDGER_TYPES,
  listLedger,
  setCustomerActive,
} from "../../data/customers";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TONE = {
  success: "badge--success",
  warning: "badge--warning",
  danger: "badge--danger",
  accent: "",
};

// payment_method is an enum, so show it as readable words without assuming its values.
const methodLabel = (m) =>
  m ? m.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—";

const INITIAL_CUSTOMER = { customer: null, error: "" };
const INITIAL_LEDGER = { rows: [], total: 0, error: "" };

async function fetchCustomer({ businessId, customerId }) {
  const { data, error } = await getCustomer(businessId, customerId);
  return { customer: data ?? null, error: error?.message ?? "" };
}
export default function CustomerProfilePage() {
  const { customerId } = useParams();
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canWrite = can("customers.write");
  const canSetDiscount = can("discounts.manage");
  const canAdjust = can("customers.adjust");
  const validId = UUID.test(customerId ?? "");

  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [paying, setPaying] = useState(() => params.get("pay") === "1");
  const [adjusting, setAdjusting] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  // The customer row. `page` is a param only so it refetches on a ledger page change, as before.
  const state = useListQuery(
    fetchCustomer,
    { businessId, customerId, page },
    INITIAL_CUSTOMER,
    { enabled: validId },
  );

  // The ledger (read-only here; recording payments arrives in Step 10).
  const ledger = useListQuery(
    listLedger,
    { businessId, customerId, page },
    INITIAL_LEDGER,
    { enabled: validId },
  );

  const c = state.customer;

  function afterChange(message) {
    setEditing(false);
    setDeactivating(false);
    setNotice(message);
    state.reload();
  }

  const balanceWords = (v) =>
    v > 0
      ? `owes ${formatMoney(v, symbol)}`
      : v < 0
        ? `has ${formatMoney(-v, symbol)} in store credit`
        : "owes nothing";

  // Close the money modals, go back to the newest history rows, show a message.
  function afterMoney(message) {
    setPaying(false);
    setAdjusting(false);
    setNotice(message);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("page");
        next.delete("pay");
        return next;
      },
      { replace: true },
    );
    state.reload();
  }

  function afterPayment(result) {
    const parts = [
      `Payment of ${formatMoney(result.amount, symbol)} recorded.`,
    ];
    if (Number(result.credit_added) > 0)
      parts.push(
        `${formatMoney(result.credit_added, symbol)} of it is kept as store credit.`,
      );
    parts.push(`${c.name} now ${balanceWords(Number(result.balance_after))}.`);
    afterMoney(parts.join(" "));
  }

  function afterAdjustment(result) {
    afterMoney(
      `Balance adjusted. ${c.name} now ${balanceWords(Number(result.balance_after))}.`,
    );
  }

  function closePay() {
    setPaying(false);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("pay");
        return next;
      },
      { replace: true },
    );
  }

  async function reactivate() {
    setActionError("");
    setBusy(true);
    const { error } = await setCustomerActive(c.id, businessId, true);
    setBusy(false);
    if (error) {
      setActionError(customerError(error).message);
      return;
    }
    afterChange(`${c.name} was reactivated.`);
  }

  const back = (
    <Link className="back-link" to="/customers">
      <ArrowLeft size={16} aria-hidden="true" /> All customers
    </Link>
  );

  if (state.loading && !c) {
    return (
      <>
        <PageHeader title="Customer" subtitle="Loading…" />
        <section className="card" aria-busy="true">
          <div className="empty">
            <div className="spinner" style={{ margin: "0 auto" }} />
          </div>
        </section>
      </>
    );
  }

  if (state.error || !c) {
    return (
      <>
        <PageHeader title="Customer" />
        {back}
        <section className="card">
          <div className="empty">
            <h2 className="card__title">
              {state.error
                ? "Could not load this customer"
                : "Customer not found"}
            </h2>
            <p className="card__sub">
              {state.error ||
                "This customer does not exist in your business, or the link is wrong."}
            </p>
          </div>
        </section>
      </>
    );
  }

  const bal = Number(c.balance);

  return (
    <>
      <PageHeader title={c.name} subtitle="Customer profile" />
      {back}

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

      <div className="stack">
        <section className="card profile-head">
          <div className="profile-head__top">
            <div className="profile-head__name">
              <h2>{c.name}</h2>
              <span
                className={`badge ${c.is_active ? "badge--success" : "badge--warning"}`}
              >
                {c.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="row-actions">
              <Link
                className="btn btn--secondary btn--sm"
                to={`/sales?customer=${c.id}`}
              >
                View sales
              </Link>
              {canWrite && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setPaying(true)}
                >
                  Record payment
                </button>
              )}
              {canAdjust && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setAdjusting(true)}
                >
                  Adjust balance
                </button>
              )}
              {canWrite && (
                <>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>

                  {c.is_active ? (
                    <button
                      type="button"
                      className="btn btn--danger-outline btn--sm"
                      onClick={() => setDeactivating(true)}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={busy}
                      onClick={reactivate}
                    >
                      Reactivate
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <dl className="profile-details">
            <div>
              <dt>Phone</dt>
              <dd>{c.phone || "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{c.email || "—"}</dd>
            </div>
            <div>
              <dt>Date joined</dt>
              <dd>{formatDate(c.created_at)}</dd>
            </div>
            <div>
              <dt>Discount level</dt>
              <dd>{Number(c.discount_percent)}%</dd>
            </div>
            <div className="profile-details__wide">
              <dt>Address</dt>
              <dd>{c.address || "—"}</dd>
            </div>
            <div className="profile-details__wide">
              <dt>Notes</dt>
              <dd>{c.notes || "—"}</dd>
            </div>
          </dl>
        </section>

        <div className="grid-kpi">
          <div className="card">
            <div className="kpi__top">
              <span>Outstanding balance</span>
              <span className="kpi__icon">
                <Wallet size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              <BalanceText value={bal} symbol={symbol} />
            </div>
            <div className="kpi__trend">
              {bal > 0
                ? "Money this customer owes you"
                : bal < 0
                  ? "Store credit you owe them"
                  : "Nothing owed either way"}
            </div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Total spent</span>
              <span className="kpi__icon">
                <Banknote size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              {formatMoney(c.total_spent, symbol)}
            </div>
            <div className="kpi__trend">Completed sales, minus refunds</div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Orders</span>
              <span className="kpi__icon">
                <ShoppingBag size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">{c.total_orders}</div>
            <div className="kpi__trend">Completed sales</div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Last purchase</span>
              <span className="kpi__icon">
                <Clock size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              {c.last_purchase_at ? formatDate(c.last_purchase_at) : "Never"}
            </div>
            <div className="kpi__trend">Most recent sale</div>
          </div>
        </div>

        <section className="card" aria-busy={ledger.loading}>
          <h2 className="card__title">Debt and credit history</h2>
          <p className="card__sub">
            Every change to what this customer owes. Positive amounts increase
            the balance owed, negative amounts reduce it.
          </p>

          {ledger.error ? (
            <div
              className="alert alert--danger"
              role="alert"
              style={{ marginTop: "var(--space-4)" }}
            >
              Could not load the history: {ledger.error}{" "}
              {page > 1 && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setParams({}, { replace: true })}
                >
                  Back to page 1
                </button>
              )}
            </div>
          ) : ledger.loading && ledger.rows.length === 0 ? (
            <div className="empty">
              <div className="spinner" style={{ margin: "0 auto" }} />
            </div>
          ) : ledger.total === 0 ? (
            <div className="empty">
              <h3 className="card__title">No debt or credit activity yet</h3>
              <p className="card__sub">
                Credit sales, payments and adjustments for this customer will be
                listed here.
              </p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th className="num">Amount</th>
                      <th className="num">Balance after</th>
                      <th>Method</th>
                      <th>Note</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((t) => {
                      const amount = Number(t.amount);
                      const type = LEDGER_TYPES[t.txn_type] ?? {
                        label: t.txn_type,
                        tone: "accent",
                      };
                      return (
                        <tr key={t.id}>
                          <td className="cell-main">
                            {formatDateTime(t.created_at)}
                          </td>
                          <td data-label="Type">
                            <span className={`badge ${TONE[type.tone]}`}>
                              {type.label}
                            </span>
                          </td>

                          <td data-label="Reference">
                            {t.sale_id ? (
                              <span className="ref-links">
                                <Link to={`/sales/${t.sale_id}`}>
                                  Sale {t.sale_label}
                                </Link>
                                {t.return_label && (
                                  <Link to={`/sales/${t.sale_id}`}>
                                    Return {t.return_label}
                                  </Link>
                                )}
                                {t.sale_status === "voided" && (
                                  <span className="badge badge--danger">
                                    Voided
                                  </span>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="num" data-label="Amount">
                            <span
                              className={
                                amount > 0 ? "balance--owes" : "balance--credit"
                              }
                            >
                              {amount > 0 ? "+" : "−"}
                              {formatMoney(Math.abs(amount), symbol)}
                            </span>
                          </td>
                          <td className="num" data-label="Balance after">
                            <BalanceText
                              value={t.balance_after}
                              symbol={symbol}
                            />
                          </td>
                          <td data-label="Method">
                            <span className="amount-stack">
                              <span>{methodLabel(t.payment_method)}</span>
                              {t.reference && (
                                <span className="product-cell__sub">
                                  Ref {t.reference}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="cell-wrap" data-label="Note">
                            {t.note || "—"}
                          </td>
                          <td className="cell-wrap" data-label="By">
                            {t.created_by_name ||
                              (t.created_by ? "Former member" : "—")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                total={ledger.total}
                onPage={(n) =>
                  setParams(n > 1 ? { page: String(n) } : {}, { replace: true })
                }
              />
            </>
          )}
        </section>
      </div>

      {canWrite && paying && (
        <RecordPaymentModal
          open
          onClose={closePay}
          businessId={businessId}
          customer={c}
          symbol={symbol}
          onDone={afterPayment}
        />
      )}
      {canAdjust && adjusting && (
        <AdjustBalanceModal
          open
          onClose={() => setAdjusting(false)}
          businessId={businessId}
          customer={c}
          symbol={symbol}
          onDone={afterAdjustment}
        />
      )}
      {canWrite && editing && (
        <CustomerModal
          open
          onClose={() => setEditing(false)}
          businessId={businessId}
          customer={c}
          canSetDiscount={canSetDiscount}
          onSaved={afterChange}
        />
      )}
      {canWrite && deactivating && (
        <DeactivateCustomerModal
          open
          onClose={() => setDeactivating(false)}
          businessId={businessId}
          customer={c}
          symbol={symbol}
          onDone={afterChange}
        />
      )}
    </>
  );
}
