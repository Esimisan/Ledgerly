import Field from "../ui/Field";
import { PAYMENT_METHODS } from "../../data/sales";
import { newPayment, parseAmount, toCents } from "../../lib/saleInput";

const MAX_PAYMENTS = 10; // the database function accepts up to 10

// totalCents is 0 while the total is unknown, which disables the fill buttons.
export default function PaymentsEditor({
  payments,
  onChange,
  totalCents,
  symbol,
}) {
  const update = (key, patch) =>
    onChange(payments.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  function remove(key) {
    if (payments.length === 1) {
      // the last row is cleared, not removed, so there is always one to type in
      onChange([{ ...payments[0], amount: "", reference: "" }]);
      return;
    }
    onChange(payments.filter((p) => p.key !== key));
  }

  // What is still unpaid once every OTHER row is counted.
  function fillRow(key) {
    const others = payments
      .filter((p) => p.key !== key)
      .reduce((sum, p) => {
        const a = parseAmount(p.amount);
        return a === null ? sum : sum + toCents(a);
      }, 0);
    const rest = totalCents - others;
    if (rest > 0) update(key, { amount: String(rest / 100) });
  }

  function payInFull() {
    onChange([{ ...payments[0], amount: String(totalCents / 100) }]);
  }

  return (
    <div className="stack">
      <div>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={totalCents <= 0}
          onClick={payInFull}
        >
          Pay in full
        </button>
      </div>

      {payments.map((p, index) => {
        const bad = p.amount.trim() !== "" && parseAmount(p.amount) === null;
        return (
          <div className="pay-row" key={p.key}>
            <div className="pay-row__top">
              <Field
                as="select"
                label="Method"
                value={p.method}
                onChange={(e) => update(p.key, { method: e.target.value })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Field>
              <Field
                label={`Amount (${symbol})`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={p.amount}
                error={
                  bad
                    ? "Enter an amount above 0, with at most 2 decimals."
                    : undefined
                }
                onChange={(e) => update(p.key, { amount: e.target.value })}
              />
            </div>
            {p.method !== "cash" && (
              <Field
                label="Reference (optional)"
                value={p.reference}
                maxLength={100}
                hint="For example a transfer ID or POS receipt number."
                onChange={(e) => update(p.key, { reference: e.target.value })}
              />
            )}
            <div className="pay-row__actions">
              <button
                type="button"
                className="link-btn"
                disabled={totalCents <= 0}
                onClick={() => fillRow(p.key)}
              >
                Fill the rest
              </button>
              {(payments.length > 1 || p.amount !== "") && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => remove(p.key)}
                  aria-label={`Remove payment ${index + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}

      {payments.length < MAX_PAYMENTS && (
        <div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onChange([...payments, newPayment()])}
          >
            Add another payment
          </button>
        </div>
      )}
    </div>
  );
}
