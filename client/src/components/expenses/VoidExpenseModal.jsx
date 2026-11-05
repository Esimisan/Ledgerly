import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  expenseError,
  formatExpenseDate,
  voidExpense,
} from "../../data/expenses";
import { formatMoney } from "../../lib/format";

export default function VoidExpenseModal({
  open,
  onClose,
  businessId,
  symbol,
  expense,
  onDone,
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const text = reason.trim();
    if (!text) {
      setReasonError("Give a reason for voiding this expense.");
      return;
    }
    setReasonError("");
    setError("");
    setBusy(true);
    const { error: err } = await voidExpense({
      businessId,
      expenseId: expense.id,
      reason: text,
    });
    if (err) {
      setBusy(false);
      setError(expenseError(err));
      return;
    }
    onDone(`The ${formatMoney(expense.amount, symbol)} expense was voided.`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Void expense">
      <form className="stack" onSubmit={submit}>
        <p className="info-note">
          Void {formatMoney(expense.amount, symbol)} for{" "}
          <strong>{expense.category_name}</strong> on{" "}
          {formatExpenseDate(expense.expense_date)}
          {expense.description ? ` (${expense.description})` : ""}? It will be
          left out of your totals and can no longer be edited. It stays in the
          list as Voided. This cannot be undone.
        </p>

        <Field
          as="textarea"
          label="Reason"
          hint="For example: entered twice, or wrong amount."
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError}
          maxLength={500}
        />

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
          <button className="btn btn--danger" disabled={busy}>
            {busy ? "Voiding…" : "Void expense"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
