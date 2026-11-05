import { useEffect, useRef, useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import { listCategoryOptions } from "../../data/expenseCategories";
import { expenseError, saveExpense, todayLocal } from "../../data/expenses";
import { PAYMENT_METHODS } from "../../data/sales";
import { RECEIPT_ACCEPT, prepareReceipt } from "../../lib/receipts";
import { parseAmount } from "../../lib/saleInput";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// expense = null means "add"; an expense row means "edit".
export default function ExpenseModal({
  open,
  onClose,
  businessId,
  symbol,
  expense,
  onSaved,
}) {
  const fileRef = useRef(null);
  const today = todayLocal();
  // Normally no future dates; an existing expense that already has one keeps it.
  const maxDate =
    expense && expense.expense_date > today ? expense.expense_date : today;

  const [form, setForm] = useState(() => ({
    category_id: expense?.category_id ?? "",
    amount: expense ? String(Number(expense.amount)) : "",
    expense_date: expense?.expense_date ?? today,
    description: expense?.description ?? "",
    vendor: expense?.vendor ?? "",
    payment_method: expense?.payment_method ?? "",
  }));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const [cats, setCats] = useState({ loading: true, rows: [], error: "" });
  useEffect(() => {
    let cancelled = false;
    listCategoryOptions(businessId, expense?.category_id ?? "").then(
      ({ rows, error }) => {
        if (!cancelled) setCats({ loading: false, rows, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [businessId, expense?.category_id]);

  // Receipt: a newly chosen file waits here until Save.
  const [newReceipt, setNewReceipt] = useState(null); // { blob, ext, kind, name }
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [receiptError, setReceiptError] = useState("");

  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still fires
    if (!file) return;
    setReceiptError("");
    setPreparing(true);
    try {
      setNewReceipt(await prepareReceipt(file));
      setRemoveReceipt(false);
    } catch (err) {
      setReceiptError(err.message);
    } finally {
      setPreparing(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const amount = parseAmount(form.amount.replace(/,/g, ""));
    const next = {};
    if (!form.category_id) next.category = "Choose a category.";
    if (amount === null)
      next.amount =
        "Enter an amount above zero, with at most 2 decimal places.";
    if (!DATE_RE.test(form.expense_date))
      next.date = "Choose the date of the expense.";
    else if (form.expense_date > maxDate)
      next.date = "The date cannot be in the future.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setError("");
    setBusy(true);
    try {
      await saveExpense({
        businessId,
        id: expense?.id,
        fields: { ...form, amount },
        newReceipt,
        removeReceipt,
        previousPath: expense?.receipt_path ?? null,
      });
    } catch (err) {
      setBusy(false);
      setError(expenseError(err));
      return;
    }
    onSaved(expense ? "Expense updated." : "Expense added.");
  }

  const hasSaved = Boolean(expense?.receipt_path);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? "Edit expense" : "Add expense"}
    >
      <form className="stack expense-form" onSubmit={submit}>
        <Field
          as="select"
          label="Category"
          value={form.category_id}
          onChange={set("category_id")}
          error={
            errors.category || (cats.error ? "Could not load categories." : "")
          }
          disabled={cats.loading}
        >
          <option value="">
            {cats.loading ? "Loading…" : "Choose a category"}
          </option>
          {cats.rows.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </Field>

        <div className="form-row form-row--2">
          <Field
            label={`Amount (${symbol})`}
            inputMode="decimal"
            value={form.amount}
            onChange={set("amount")}
            error={errors.amount}
            placeholder="0.00"
            autoComplete="off"
          />
          <Field
            label="Date"
            type="date"
            value={form.expense_date}
            max={maxDate}
            onChange={set("expense_date")}
            error={errors.date}
          />
        </div>

        <Field
          as="textarea"
          label="Description"
          hint="What was this for? Optional."
          rows={2}
          value={form.description}
          onChange={set("description")}
          maxLength={500}
        />

        <div className="form-row form-row--2">
          <Field
            label="Paid to (vendor)"
            value={form.vendor}
            onChange={set("vendor")}
            maxLength={120}
            placeholder="Optional"
          />
          <Field
            as="select"
            label="Payment method"
            value={form.payment_method}
            onChange={set("payment_method")}
          >
            <option value="">Not specified</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Field>
        </div>

        <div className="field">
          <span className="field__label">Receipt (optional)</span>
          <div className="receipt-picker">
            <input
              ref={fileRef}
              type="file"
              hidden
              accept={RECEIPT_ACCEPT}
              onChange={pickFile}
            />
            <div className="receipt-picker__status">
              {preparing
                ? "Preparing the file…"
                : newReceipt
                  ? `Selected: ${newReceipt.name || "receipt"} (${newReceipt.kind === "pdf" ? "PDF" : "photo"}). It is saved when you press Save.`
                  : hasSaved && !removeReceipt
                    ? "A receipt is attached."
                    : hasSaved && removeReceipt
                      ? "The receipt will be removed when you press Save."
                      : "No receipt attached."}
            </div>
            <div className="receipt-picker__actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={preparing || busy}
                onClick={() => fileRef.current?.click()}
              >
                {newReceipt || (hasSaved && !removeReceipt)
                  ? "Replace receipt"
                  : "Attach receipt"}
              </button>
              {newReceipt && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => setNewReceipt(null)}
                >
                  Clear selection
                </button>
              )}
              {!newReceipt && hasSaved && !removeReceipt && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => setRemoveReceipt(true)}
                >
                  Remove receipt
                </button>
              )}
              {!newReceipt && hasSaved && removeReceipt && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => setRemoveReceipt(false)}
                >
                  Keep receipt
                </button>
              )}
            </div>
          </div>
          {receiptError ? (
            <p className="field__error">{receiptError}</p>
          ) : (
            <p className="field__hint">
              A photo (JPG, PNG or WebP) or a PDF, up to 5 MB.
            </p>
          )}
        </div>

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
          <button className="btn btn--primary" disabled={busy || preparing}>
            {busy ? "Saving…" : expense ? "Save changes" : "Add expense"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
