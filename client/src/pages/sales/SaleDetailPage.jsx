import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Banknote, Printer, Undo2, Wallet } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Receipt from "../../components/sales/Receipt";
import ReturnModal from "../../components/sales/ReturnModal";
import VoidSaleModal from "../../components/sales/VoidSaleModal";
import {
  PaymentBadge,
  SaleStatusBadge,
} from "../../components/sales/SaleBadges";
import { useAuth } from "../../context/AuthContext";
import {
  getSale,
  listReturnItems,
  listSaleItems,
  listSalePayments,
  listSaleReturns,
} from "../../data/sales";
import {
  formatDateTime,
  formatMoney,
  formatQty,
  humanize,
} from "../../lib/format";
import { printWhenReady } from "../../lib/printWhenReady";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SaleDetailPage() {
  const { saleId } = useParams();
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const validId = UUID.test(saleId ?? "");

  const [voiding, setVoiding] = useState(false);
  const [returning, setReturning] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  // `key` records which sale and reload the data belongs to. The page counts as
  // loading until it matches, so no state is set at the start of the effect.
  const loadKey = `${saleId}:${reload}`;
  const [raw, setState] = useState({
    key: "",
    sale: null,
    items: [],
    payments: [],
    returns: [],
    returnItems: [],
    error: "",
  });

  useEffect(() => {
    if (!validId) return undefined;
    let cancelled = false;
    (async () => {
      const { data: sale, error } = await getSale(businessId, saleId);
      if (cancelled) return;
      if (error || !sale) {
        setState((s) => ({
          ...s,
          key: loadKey,
          sale: null,
          error: error?.message ?? "",
        }));
        return;
      }
      const [items, payments, returns] = await Promise.all([
        listSaleItems(businessId, saleId),
        listSalePayments(businessId, saleId),
        listSaleReturns(businessId, saleId),
      ]);
      const returnItems = await listReturnItems(
        businessId,
        returns.rows.map((r) => r.id),
      );
      if (cancelled) return;
      setState({
        key: loadKey,
        sale,
        items: items.rows,
        payments: payments.rows,
        returns: returns.rows,
        returnItems: returnItems.rows,
        error:
          items.error || payments.error || returns.error || returnItems.error,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, saleId, validId, loadKey]);

  // A bad link shows "Sale not found"; otherwise loading lasts until the data
  // for this sale has arrived.
  const state = validId
    ? { ...raw, loading: raw.key !== loadKey }
    : {
        loading: false,
        sale: null,
        items: [],
        payments: [],
        returns: [],
        returnItems: [],
        error: "",
      };

  const { sale, items, payments, returns, returnItems } = state;
  const back = (
    <Link className="back-link no-print" to="/sales">
      <ArrowLeft size={16} aria-hidden="true" /> All sales
    </Link>
  );

  if (state.loading && !sale) {
    return (
      <>
        <PageHeader title="Sale" subtitle="Loading…" />
        <section className="card" aria-busy="true">
          <div className="empty">
            <div className="spinner" style={{ margin: "0 auto" }} />
          </div>
        </section>
      </>
    );
  }

  if (state.error && !sale) {
    return (
      <>
        <PageHeader title="Sale" />
        {back}
        <section className="card">
          <div className="empty">
            <h2 className="card__title">Could not load this sale</h2>
            <p className="card__sub">{state.error}</p>
          </div>
        </section>
      </>
    );
  }

  if (!sale) {
    return (
      <>
        <PageHeader title="Sale" />
        {back}
        <section className="card">
          <div className="empty">
            <h2 className="card__title">Sale not found</h2>
            <p className="card__sub">
              This sale does not exist in your business, or the link is wrong.
            </p>
          </div>
        </section>
      </>
    );
  }

  const completed = sale.status === "completed";
  const canReturn =
    can("sales.return") &&
    completed &&
    items.some((i) => Number(i.quantity) - Number(i.returned_quantity) > 0);
  const canVoid = can("sales.void") && completed && sale.return_count === 0;
  const voidBlockedByReturns =
    can("sales.void") && completed && sale.return_count > 0;
  const itemName = Object.fromEntries(items.map((i) => [i.id, i.product_name]));
  // Credit part of the sale, minus debt cancelled by returns, minus what is still
  // owed, is what the customer has paid since on their account.
  const debtCancelledByReturns = returns.reduce(
    (sum, r) => sum + Number(r.debt_offset),
    0,
  );
  const paidSince = completed
    ? Math.max(
        Number(sale.balance_due) -
          debtCancelledByReturns -
          Number(sale.amount_outstanding),
        0,
      )
    : 0;
  const canRecordPayment =
    can("customers.write") &&
    completed &&
    Boolean(sale.customer_id) &&
    Number(sale.amount_outstanding) > 0;

  function afterVoid(result) {
    const parts = [`Sale ${result.sale_label} was voided.`];
    if (Number(result.amount_paid) > 0)
      parts.push(
        `Hand back ${formatMoney(result.amount_paid, symbol)} that was taken at the till.`,
      );
    if (result.skipped_products?.length)
      parts.push(
        `Not put back in stock because the product is inactive or deleted: ${result.skipped_products.join(", ")}.`,
      );
    setVoiding(false);
    setNotice(parts.join(" "));
    setReload((n) => n + 1);
  }

  function afterReturn(result) {
    const parts = [
      `Return ${result.return_label} recorded. Refund ${formatMoney(result.refund_total, symbol)}.`,
    ];
    if (Number(result.debt_offset) > 0)
      parts.push(
        `${formatMoney(result.debt_offset, symbol)} cancelled what was still owed.`,
      );
    if (Number(result.refund_paid) > 0)
      parts.push(
        result.refund_method === "store_credit"
          ? `${formatMoney(result.refund_paid, symbol)} added as store credit.`
          : `Pay ${formatMoney(result.refund_paid, symbol)} back by ${humanize(result.refund_method).toLowerCase()}.`,
      );
    if (result.not_restocked?.length)
      parts.push(
        `Not put back in stock: ${result.not_restocked
          .map((n) => `${n.product_name} (${n.reason})`)
          .join(", ")}.`,
      );
    setReturning(false);
    setNotice(parts.join(" "));
    setReload((n) => n + 1);
  }

  return (
    <>
      <PageHeader title={sale.sale_label} subtitle="Sale details" />
      {back}

      {notice && (
        <div className="alert alert--success no-print" role="status">
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
      {state.error && (
        <div className="alert alert--danger no-print" role="alert">
          Some details could not be loaded: {state.error}
        </div>
      )}

      <div className="stack">
        <section className="card profile-head no-print">
          <div className="profile-head__top">
            <div className="profile-head__name">
              <h2>{sale.sale_label}</h2>
              <SaleStatusBadge status={sale.status} />
              <PaymentBadge sale={sale} symbol={symbol} />
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => printWhenReady()}
              >
                <Printer size={16} aria-hidden="true" /> Print receipt
              </button>
              {canRecordPayment && (
                <Link
                  className="btn btn--primary btn--sm"
                  to={`/customers/${sale.customer_id}?pay=1`}
                >
                  Record payment
                </Link>
              )}
              {canReturn && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setReturning(true)}
                >
                  <Undo2 size={16} aria-hidden="true" /> Return items
                </button>
              )}
              {canVoid && (
                <button
                  type="button"
                  className="btn btn--danger-outline btn--sm"
                  onClick={() => setVoiding(true)}
                >
                  Void sale
                </button>
              )}
            </div>
          </div>

          <dl className="profile-details">
            <div>
              <dt>Date</dt>
              <dd>{formatDateTime(sale.sold_at)}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>
                {sale.customer_id ? (
                  <Link to={`/customers/${sale.customer_id}`}>
                    {sale.customer_name || "Customer"}
                  </Link>
                ) : (
                  "Walk-in customer"
                )}
              </dd>
            </div>
            <div>
              <dt>Recorded by</dt>
              <dd>{sale.created_by_name || "—"}</dd>
            </div>
            {sale.notes && (
              <div className="profile-details__wide">
                <dt>Note</dt>
                <dd>{sale.notes}</dd>
              </div>
            )}
          </dl>

          {voidBlockedByReturns && (
            <p className="info-note">
              This sale already has returns, so it cannot be voided. Use Return
              items for anything that is still left.
            </p>
          )}
        </section>

        {!completed && (
          <div className="alert alert--danger no-print" role="status">
            This sale was voided on {formatDateTime(sale.voided_at)}
            {sale.voided_by_name ? ` by ${sale.voided_by_name}` : ""}.
            {sale.void_reason ? ` Reason: ${sale.void_reason}` : ""}
          </div>
        )}

        <div className="grid-kpi no-print">
          <div className="card">
            <div className="kpi__top">
              <span>Total</span>
              <span className="kpi__icon">
                <Banknote size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">{formatMoney(sale.total, symbol)}</div>
            <div className="kpi__trend">
              {Number(sale.discount_total) > 0
                ? `After ${formatMoney(sale.discount_total, symbol)} discount`
                : "No discount"}
            </div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Paid at the till</span>
              <span className="kpi__icon">
                <Wallet size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              {formatMoney(sale.amount_paid, symbol)}
            </div>
            <div className="kpi__trend">
              {payments.length} {payments.length === 1 ? "payment" : "payments"}
            </div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Still owed</span>
              <span className="kpi__icon">
                <Wallet size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              {formatMoney(sale.amount_outstanding, symbol)}
            </div>
            <div className="kpi__trend">
              {!completed
                ? "A voided sale owes nothing"
                : paidSince > 0
                  ? `After returns, and ${formatMoney(paidSince, symbol)} paid since`
                  : "After any returns"}
            </div>
          </div>
          <div className="card">
            <div className="kpi__top">
              <span>Refunded</span>
              <span className="kpi__icon">
                <Undo2 size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi__value">
              {formatMoney(sale.refunded_total, symbol)}
            </div>
            <div className="kpi__trend">
              {sale.return_count}{" "}
              {sale.return_count === 1 ? "return" : "returns"}
            </div>
          </div>
        </div>

        <section className="receipt-wrap" aria-label="Receipt">
          <Receipt
            businessName={business.name}
            logoPath={business.logo_path}
            sale={sale}
            items={items}
            payments={payments}
            symbol={symbol}
          />
        </section>

        <section className="card no-print">
          <h2 className="card__title">Payments taken at the till</h2>
          <p className="card__sub">
            Money received when the sale was made. Anything not listed here was
            put on the customer&rsquo;s account.
          </p>
          {payments.length === 0 ? (
            <div className="empty">
              <p className="card__sub">No payment was taken for this sale.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Method</th>
                    <th className="num">Amount</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="cell-main">{formatDateTime(p.paid_at)}</td>
                      <td data-label="Method">{humanize(p.method)}</td>
                      <td className="num" data-label="Amount">
                        {formatMoney(p.amount, symbol)}
                      </td>
                      <td className="cell-wrap" data-label="Reference">
                        {p.reference || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {returns.length > 0 && (
          <section className="card stack no-print">
            <div>
              <h2 className="card__title">Returns</h2>
              <p className="card__sub">
                Goods the customer brought back from this sale.
              </p>
            </div>
            {returns.map((r) => {
              const lines = returnItems.filter(
                (ri) => ri.sale_return_id === r.id,
              );
              return (
                <article className="return-card" key={r.id}>
                  <div className="return-card__head">
                    <strong>{r.return_label}</strong>
                    <span className="product-cell__sub">
                      {formatDateTime(r.returned_at)}
                      {r.created_by_name ? ` · ${r.created_by_name}` : ""}
                    </span>
                  </div>
                  <p>
                    Refund{" "}
                    <strong>{formatMoney(r.refund_total, symbol)}</strong>
                    {Number(r.debt_offset) > 0 &&
                      `, of which ${formatMoney(r.debt_offset, symbol)} cancelled what was still owed`}
                    {Number(r.refund_paid) > 0 &&
                      `, and ${formatMoney(r.refund_paid, symbol)} was paid back by ${humanize(r.refund_method).toLowerCase()}`}
                    .
                  </p>
                  {r.reason && <p className="card__sub">Reason: {r.reason}</p>}
                  <ul className="return-card__lines">
                    {lines.map((ri) => (
                      <li key={ri.id}>
                        {formatQty(ri.quantity)} ×{" "}
                        {itemName[ri.sale_item_id] || "Product"}
                        <span className="product-cell__sub">
                          {" "}
                          · {formatMoney(ri.line_total, symbol)} ·{" "}
                          {ri.condition === "damaged"
                            ? "damaged"
                            : "resellable"}
                          {ri.restocked ? ", back in stock" : ", not restocked"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {canVoid && voiding && (
        <VoidSaleModal
          open
          onClose={() => setVoiding(false)}
          businessId={businessId}
          sale={sale}
          symbol={symbol}
          onDone={afterVoid}
        />
      )}
      {canReturn && returning && (
        <ReturnModal
          open
          onClose={() => setReturning(false)}
          businessId={businessId}
          sale={sale}
          items={items}
          symbol={symbol}
          onDone={afterReturn}
        />
      )}
    </>
  );
}
