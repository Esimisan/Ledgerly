import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import BalanceText from "./BalanceText";
import { PAYMENT_METHODS } from "../../data/sales";
import {
  listOutstandingSales,
  moneyError,
  recordCustomerPayment,
} from "../../data/customers";
import { formatMoney } from "../../lib/format";
import { parseAmount, toCents } from "../../lib/saleInput";

// onDone receives the result of record_customer_payment.
export default function RecordPaymentModal({
  open,
  onClose,
  businessId,
  customer,
  symbol,
  onDone,
}) {
  const [form, setForm] = useState({
    amount: "",
    method: "cash",
    reference: "",
    note: "",
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [sales, setSales] = useState({ loading: true, rows: [], error: "" });
  useEffect(() => {
    let cancelled = false;
    listOutstandingSales({ businessId, customerId: customer.id }).then(
      (result) => {
        if (!cancelled) setSales({ loading: false, ...result });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [businessId, customer.id]);

  const balanceCents = toCents(customer.balance);
  const owedCents = Math.max(balanceCents, 0);
  const amount = parseAmount(form.amount);
  const amountCents = amount === null ? 0 : toCents(amount);
  const salesKnown = !sales.loading && !sales.error;

  // Same order the database uses: money not tied to a sale first, then the oldest sale.
  let preview = null;
  if (amountCents > 0 && salesKnown) {
    const salesCents = sales.rows.reduce(
      (sum, s) => sum + toCents(s.amount_outstanding),
      0,
    );
    let rest = amountCents;
    const manual = Math.min(rest, Math.max(owedCents - salesCents, 0));
    rest -= manual;
    const cleared = [];
    for (const s of sales.rows) {
      if (rest <= 0) break;
      const owe = toCents(s.amount_outstanding);
      const take = Math.min(rest, owe);
      cleared.push({ label: s.sale_label, take, full: take === owe });
      rest -= take;
    }
    preview = { manual, cleared, credit: rest };
  }
  const overCents = Math.max(amountCents - owedCents, 0);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (amount === null) {
      setFieldError(
        "Enter an amount above zero, with at most 2 decimal places.",
      );
      return;
    }
    setFieldError("");
    setBusy(true);
    const { data, error: err } = await recordCustomerPayment({
      businessId,
      customerId: customer.id,
      amount,
      method: form.method,
      reference: form.reference,
      note: form.note,
    });
    setBusy(false);
    if (err) {
      setError(moneyError(err));
      return;
    }
    onDone(data);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record payment from ${customer.name}`}
    >
      <form className="stack" onSubmit={submit} noValidate>
        <p className="modal__text">
          Balance now: <BalanceText value={customer.balance} symbol={symbol} />.
          The payment clears what they owe on their oldest sales first.
        </p>

        <Field
          label={`Amount (${symbol})`}
          inputMode="decimal"
          value={form.amount}
          onChange={set("amount")}
          error={fieldError || undefined}
          autoComplete="off"
          placeholder="0.00"
        />
        {owedCents > 0 && (
          <div>
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                setForm((f) => ({ ...f, amount: String(owedCents / 100) }))
              }
            >
              Pay the full balance ({formatMoney(owedCents / 100, symbol)})
            </button>
          </div>
        )}

        <Field
          as="select"
          label="Payment method"
          value={form.method}
          onChange={set("method")}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Field>
        {form.method !== "cash" && (
          <Field
            label="Reference (optional)"
            value={form.reference}
            maxLength={100}
            hint="For example a transfer ID or POS receipt number."
            onChange={set("reference")}
          />
        )}
        <Field
          as="textarea"
          label="Note (optional)"
          rows={2}
          maxLength={500}
          value={form.note}
          onChange={set("note")}
        />

        {preview && (
          <div className="stack">
            {(preview.manual > 0 || preview.cleared.length > 0) && (
              <div>
                <p className="field__label">This payment settles</p>
                <ul className="warn-list">
                  {preview.manual > 0 && (
                    <li>
                      {formatMoney(preview.manual / 100, symbol)} owed that is
                      not tied to a sale
                    </li>
                  )}
                  {preview.cleared.map((c) => (
                    <li key={c.label}>
                      {c.full ? "" : "Part of "}
                      sale {c.label}: {formatMoney(c.take / 100, symbol)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <dl className="summary">
              <div className="summary__row">
                <dt>Balance after</dt>
                <dd>
                  <BalanceText
                    value={(balanceCents - amountCents) / 100}
                    symbol={symbol}
                  />
                </dd>
              </div>
            </dl>
          </div>
        )}
        {amountCents > 0 && overCents > 0 && (
          <p className="info-note">
            {formatMoney(overCents / 100, symbol)} is more than {customer.name}{" "}
            owes, so it is kept as store credit and used against their next
            sale.
          </p>
        )}
        {sales.error && (
          <p className="field__hint">
            Could not list the sales this will settle, but you can still record
            the payment.
          </p>
        )}

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn btn--primary" disabled={busy}>
            {busy
              ? "Saving…"
              : amountCents > 0
                ? `Record ${formatMoney(amountCents / 100, symbol)}`
                : "Record payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
