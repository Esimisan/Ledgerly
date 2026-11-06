import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import BalanceText from "./BalanceText";
import { moneyError, recordCustomerAdjustment } from "../../data/customers";
import { parseAmount, toCents } from "../../lib/saleInput";

// onDone receives the result of record_customer_adjustment.
export default function AdjustBalanceModal({
  open,
  onClose,
  businessId,
  customer,
  symbol,
  onDone,
}) {
  const [direction, setDirection] = useState("decrease");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = parseAmount(amountText);
  const signed =
    amount === null ? 0 : direction === "increase" ? amount : -amount;
  const afterCents = toCents(customer.balance) + toCents(signed);

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (amount === null)
      found.amount =
        "Enter an amount above zero, with at most 2 decimal places.";
    if (!reason.trim()) found.reason = "Give a reason for this adjustment.";
    setErrors(found);
    setError("");
    if (Object.keys(found).length) return;

    setBusy(true);
    const { data, error: err } = await recordCustomerAdjustment({
      businessId,
      customerId: customer.id,
      amount: signed,
      reason,
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
      title={`Adjust balance for ${customer.name}`}
    >
      <form className="stack" onSubmit={submit} noValidate>
        <p className="modal__text">
          Balance now: <BalanceText value={customer.balance} symbol={symbol} />.
          Use this for corrections that are not a sale or a payment. Every
          adjustment is kept in their history with your reason.
        </p>

        <Field
          as="select"
          label="What do you want to do?"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        >
          <option value="decrease">
            Reduce what they owe (write-off or credit)
          </option>
          <option value="increase">
            Increase what they owe (for example an opening balance)
          </option>
        </Field>

        <Field
          label={`Amount (${symbol})`}
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          error={errors.amount}
          autoComplete="off"
          placeholder="0.00"
          hint={
            direction === "decrease"
              ? "Oldest unpaid sales are cleared first. Anything above what they owe becomes store credit."
              : undefined
          }
        />

        <Field
          as="textarea"
          label="Reason"
          rows={3}
          maxLength={500}
          value={reason}
          error={errors.reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {amount !== null && (
          <dl className="summary">
            <div className="summary__row">
              <dt>Balance after</dt>
              <dd>
                <BalanceText value={afterCents / 100} symbol={symbol} />
              </dd>
            </div>
          </dl>
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
            {busy ? "Saving…" : "Save adjustment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
