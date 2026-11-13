import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import CartTable from "../../components/sales/CartTable";
import CustomerPicker from "../../components/sales/CustomerPicker";
import PaymentsEditor from "../../components/sales/PaymentsEditor";
import ProductPicker from "../../components/sales/ProductPicker";
import SaleSummary from "../../components/sales/SaleSummary";
import { useAuth } from "../../context/AuthContext";
import { useImageUrls } from "../../hooks/useImageUrls";
import { createSale, quoteSale, saleError } from "../../data/sales";
import { formatMoney } from "../../lib/format";
import {
  checkManual,
  newPayment,
  parseAmount,
  parseQty,
  toCents,
} from "../../lib/saleInput";

const EMPTY_QUOTE = { key: null, data: null, error: "" };

export default function NewSalePage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const canManual = can("discounts.manage");

  const [customer, setCustomer] = useState(null); // null = walk-in
  const [cart, setCart] = useState([]);
  const [promo, setPromo] = useState("");
  const [manualOn, setManualOn] = useState(false);
  const [manual, setManual] = useState({ type: "percent", value: "" });
  const [payments, setPayments] = useState(() => [newPayment()]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(null); // the success panel
  const [refresh, setRefresh] = useState(0); // bumped to force a new quote

  const imageUrls = useImageUrls(cart.map((l) => l.imagePath));

  // ---------- what the server should price ----------
  const items = cart.map((l) => ({
    productId: l.productId,
    quantity: parseQty(l.quantity),
  }));
  const allQtyValid =
    cart.length > 0 && items.every((i) => i.quantity !== null);
  const manualCheck = checkManual(manualOn, manual);
  const effectiveManual =
    manualCheck.active && manualCheck.valid
      ? { type: manual.type, value: manualCheck.value }
      : null;
  const promoClean = promo.trim();
  const canQuote = allQtyValid && !(manualCheck.active && !manualCheck.valid);

  // Anything that changes the price changes this key. A quote is only trusted
  // while its key matches the one on screen.
  const quoteKey = JSON.stringify([
    customer?.id ?? null,
    items.map((i) => [i.productId, i.quantity]),
    promoClean.toLowerCase(),
    effectiveManual,
    refresh,
  ]);

  const [quoteState, setQuoteState] = useState(EMPTY_QUOTE);
  // Not priceable: forget the old quote. This replaces the reset the effect used
  // to do (React allows a guarded state update during render).
  if (!canQuote && quoteState !== EMPTY_QUOTE) setQuoteState(EMPTY_QUOTE);

  useEffect(() => {
    if (!canQuote) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await quoteSale({
        businessId,
        customerId: customer?.id,
        items,
        promoCode: promoClean,
        manual: effectiveManual,
      });
      if (cancelled) return;
      setQuoteState(
        error
          ? { key: quoteKey, data: null, error: saleError(error) }
          : { key: quoteKey, data, error: "" },
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, canQuote]);

  const quote = quoteState.data;
  const current = quoteState.key === quoteKey;
  const settled = current; // loading is simply "the quote on screen is not for this key yet"
  const quoteLines = Object.fromEntries(
    (quote?.lines ?? []).map((l) => [l.product_id, l]),
  );

  // ---------- payments ----------
  const totalCents = quote ? toCents(quote.total) : 0;
  const paidCents = payments.reduce((sum, p) => {
    const a = parseAmount(p.amount);
    return a === null ? sum : sum + toCents(a);
  }, 0);
  const rowsInvalid = payments.some(
    (p) => p.amount.trim() !== "" && parseAmount(p.amount) === null,
  );
  const remainder = totalCents - paidCents;

  // ---------- why Save might be off (the first reason wins) ----------
  let blocker = "";
  if (cart.length === 0) blocker = "Add at least one product.";
  else if (!allQtyValid) blocker = "Fix the quantities marked in red.";
  else if (manualCheck.active && !manualCheck.valid)
    blocker = "Fix the manual discount.";
  else if (quoteState.error) blocker = "Fix the problem shown above.";
  else if (!settled) blocker = "Updating prices…";
  else if (quote?.promo_error) blocker = "Fix or clear the promo code.";
  else if (quote?.lines?.some((l) => !l.stock_ok))
    blocker = "Lower the quantities that are above stock.";
  else if (rowsInvalid) blocker = "Fix the payment amounts.";
  else if (remainder < 0) blocker = "Payments are more than the sale total.";
  else if (remainder > 0 && !customer)
    blocker =
      "Walk-in sales must be paid in full. Choose a customer to put the rest on credit.";
  const canSave = !blocker && !busy;

  // ---------- cart actions ----------
  function addProduct(p) {
    setSubmitError("");
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...c];
        const q = Number(next[i].quantity) || 0;
        next[i] = { ...next[i], quantity: String(+(q + 1).toFixed(3)) };
        return next;
      }
      return [
        ...c,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          price: p.selling_price,
          onHand: p.quantity_on_hand,
          imagePath: p.image_path,
          quantity: "1",
        },
      ];
    });
  }
  const setQty = (productId, value) =>
    setCart((c) =>
      c.map((l) => (l.productId === productId ? { ...l, quantity: value } : l)),
    );
  const removeLine = (productId) =>
    setCart((c) => c.filter((l) => l.productId !== productId));

  function reset() {
    setCustomer(null);
    setCart([]);
    setPromo("");
    setManualOn(false);
    setManual({ type: "percent", value: "" });
    setPayments([newPayment()]);
    setNotes("");
    setSubmitError("");
    setDone(null);
  }

  async function save() {
    if (!canSave) return;
    setSubmitError("");
    setBusy(true);
    const { data, error } = await createSale({
      businessId,
      customerId: customer?.id,
      items,
      payments: payments
        .filter((p) => parseAmount(p.amount) !== null)
        .map((p) => ({
          method: p.method,
          amount: parseAmount(p.amount),
          reference: p.reference,
        })),
      promoCode: promoClean,
      manual: effectiveManual,
      notes,
    });
    setBusy(false);

    if (error) {
      let message = saleError(error);
      if (message.startsWith("Could not reach"))
        message +=
          " If you are unsure, check the Sales list before trying again, in case the sale was saved.";
      setSubmitError(message);
      setRefresh((n) => n + 1); // re-quote, so changed stock shows up as a warning
      return;
    }
    setDone(data);
  }

  const back = (
    <Link className="back-link" to="/sales">
      <ArrowLeft size={16} aria-hidden="true" /> All sales
    </Link>
  );

  // ---------- success ----------
  if (done) {
    const credit = Number(done.amount_on_credit);
    const discount = Number(done.discount_total);
    return (
      <>
        <PageHeader title="New sale" subtitle="Sale recorded" />
        {back}
        <section className="card sale-done" role="status">
          <span className="sale-done__icon">
            <Check size={24} aria-hidden="true" />
          </span>
          <h2 className="card__title">Sale {done.sale_label} recorded</h2>
          <p className="card__sub">
            Total {formatMoney(done.total, symbol)}
            {discount > 0
              ? ` after ${formatMoney(discount, symbol)} discount`
              : ""}
            . Paid {formatMoney(done.amount_paid, symbol)}
            {credit > 0
              ? `, and ${formatMoney(credit, symbol)} put on credit`
              : ""}
            .
          </p>
          <div className="kit-row" style={{ justifyContent: "center" }}>
            <Link className="btn btn--primary" to={`/sales/${done.sale_id}`}>
              View sale and receipt
            </Link>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={reset}
            >
              Record another sale
            </button>
          </div>
        </section>
      </>
    );
  }

  // ---------- the till ----------
  const customerPct = customer ? Number(customer.discount_percent) : 0;
  return (
    <>
      <PageHeader
        title="New sale"
        subtitle="Pick products, add a customer if you know them, and take payment"
      />
      {back}

      <div className="till">
        <div className="till__main">
          <section className="card stack">
            <h2 className="card__title">Customer</h2>
            <CustomerPicker
              businessId={businessId}
              symbol={symbol}
              customer={customer}
              onChange={setCustomer}
            />
          </section>

          <section className="card stack">
            <h2 className="card__title">Products</h2>
            <ProductPicker
              businessId={businessId}
              symbol={symbol}
              onAdd={addProduct}
            />
            <CartTable
              cart={cart}
              quoteLines={quoteLines}
              imageUrls={imageUrls}
              symbol={symbol}
              onQty={setQty}
              onRemove={removeLine}
            />
          </section>
        </div>

        <aside className="till__side" aria-label="Discount, payment and total">
          <section className="card stack">
            <h2 className="card__title">Discount</h2>
            <Field
              label="Promo code (optional)"
              value={promo}
              onChange={(e) => setPromo(e.target.value.toUpperCase())}
              disabled={manualCheck.active}
              maxLength={30}
              autoComplete="off"
              autoCapitalize="characters"
              error={current ? quote?.promo_error || undefined : undefined}
              hint={
                manualCheck.active
                  ? "Clear the manual discount to use a promo code."
                  : customerPct > 0
                    ? `${customerPct}% customer discount applies automatically. A promo code is used only if it is larger.`
                    : "Only one discount applies to a sale."
              }
            />
            {current && quote?.promo_note && (
              <p className="info-note">{quote.promo_note}</p>
            )}

            {canManual && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={manualOn}
                    disabled={promoClean !== ""}
                    onChange={(e) => {
                      setManualOn(e.target.checked);
                      if (!e.target.checked)
                        setManual((m) => ({ ...m, value: "" }));
                    }}
                  />
                  Give a manual discount instead
                </label>
                {manualOn && (
                  <div className="form-row form-row--2">
                    <Field
                      as="select"
                      label="Type"
                      value={manual.type}
                      onChange={(e) =>
                        setManual((m) => ({ ...m, type: e.target.value }))
                      }
                    >
                      <option value="percent">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </Field>
                    <Field
                      label={
                        manual.type === "percent"
                          ? "Percent (%)"
                          : `Amount (${symbol})`
                      }
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={manual.value}
                      error={manualCheck.error || undefined}
                      onChange={(e) =>
                        setManual((m) => ({ ...m, value: e.target.value }))
                      }
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card stack">
            <h2 className="card__title">Payment</h2>
            <p className="card__sub">
              {customer
                ? `Anything not paid now is added to ${customer.name}'s balance.`
                : "Walk-in sale: the full amount must be paid now."}
            </p>
            <PaymentsEditor
              payments={payments}
              onChange={setPayments}
              totalCents={settled ? totalCents : 0}
              symbol={symbol}
            />
          </section>

          <section className="card stack">
            <h2 className="card__title">Summary</h2>
            {quoteState.error && (
              <div className="alert alert--danger" role="alert">
                {quoteState.error}
              </div>
            )}
            <SaleSummary
              quote={quote}
              settled={settled}
              symbol={symbol}
              paidCents={paidCents}
              customer={customer}
              promoCode={promo}
            />
            <Field
              as="textarea"
              label="Note (optional)"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {submitError && (
              <div className="alert alert--danger" role="alert">
                {submitError}
              </div>
            )}
            {blocker && (
              <p className="field__hint" role="status">
                {blocker}
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={!canSave}
              onClick={save}
            >
              {busy
                ? "Saving…"
                : quote && settled
                  ? `Record sale · ${formatMoney(quote.total, symbol)}`
                  : "Record sale"}
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
