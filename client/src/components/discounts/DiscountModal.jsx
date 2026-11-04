import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  createDiscount,
  updateDiscount,
  discountError,
  toLocalInput,
} from "../../data/discounts";

const EMPTY = {
  name: "",
  code: "",
  discount_type: "percent",
  value: "",
  min_order_amount: "0",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
};

// More than 2 decimal places would be rounded silently by the database.
const tooPrecise = (n) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
const MAX_AMOUNT = 1_000_000_000;

// discount = null means "add"; a discount row means "edit".
export default function DiscountModal({
  open,
  onClose,
  businessId,
  discount,
  symbol,
  onSaved,
}) {
  const [form, setForm] = useState(() =>
    discount
      ? {
          name: discount.name ?? "",
          code: discount.code ?? "",
          discount_type: discount.discount_type,
          value: String(Number(discount.value)),
          min_order_amount: String(Number(discount.min_order_amount ?? 0)),
          starts_at: toLocalInput(discount.starts_at),
          ends_at: toLocalInput(discount.ends_at),
          usage_limit:
            discount.usage_limit == null ? "" : String(discount.usage_limit),
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isPercent = form.discount_type === "percent";

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = "Enter a name for this promo.";

    const code = form.code.trim();
    if (!code) next.code = "Enter the code customers will use.";
    else if (!/^[A-Za-z0-9_-]{3,30}$/.test(code))
      next.code =
        "Use 3 to 30 letters, numbers, dashes or underscores, with no spaces.";

    const value = Number(form.value);
    if (form.value.trim() === "" || Number.isNaN(value) || value <= 0)
      next.value = "Enter a value greater than zero.";
    else if (isPercent && value > 100)
      next.value = "A percentage cannot be more than 100.";
    else if (value >= MAX_AMOUNT) next.value = "That number is too large.";
    else if (tooPrecise(value)) next.value = "Use at most 2 decimal places.";

    const min = Number(form.min_order_amount || 0);
    if (Number.isNaN(min) || min < 0)
      next.min_order_amount = "Enter 0 or more.";
    else if (min >= MAX_AMOUNT)
      next.min_order_amount = "That number is too large.";
    else if (tooPrecise(min))
      next.min_order_amount = "Use at most 2 decimal places.";

    if (form.usage_limit.trim() !== "") {
      const limit = Number(form.usage_limit);
      if (!Number.isInteger(limit) || limit < 1 || limit >= MAX_AMOUNT)
        next.usage_limit = "Enter a whole number of 1 or more, or leave empty.";
    }

    if (
      form.starts_at &&
      form.ends_at &&
      new Date(form.ends_at) <= new Date(form.starts_at)
    )
      next.ends_at = "The end must be after the start.";

    return next;
  }

  async function submit(e) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setError("");
    if (Object.keys(found).length) return;

    setBusy(true);
    const { error: err } = discount
      ? await updateDiscount(discount.id, businessId, form)
      : await createDiscount(businessId, form);
    setBusy(false);

    if (err) {
      const { field, message } = discountError(err);
      if (field) setErrors({ [field]: message });
      else setError(message);
      return;
    }
    onSaved(discount ? "Promo updated." : "Promo added.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={discount ? "Edit promo" : "Add promo"}
    >
      <form className="stack" onSubmit={submit} noValidate>
        <Field
          label="Name"
          value={form.name}
          onChange={set("name")}
          error={errors.name}
          maxLength={120}
          placeholder="e.g. Welcome offer"
        />

        <Field
          label="Code"
          value={form.code}
          onChange={(e) =>
            setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
          }
          error={errors.code}
          maxLength={30}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="e.g. WELCOME10"
          hint="Typed at the till when recording a sale. Not case-sensitive."
        />

        <div className="form-row form-row--2">
          <Field
            as="select"
            label="Type"
            value={form.discount_type}
            onChange={set("discount_type")}
          >
            <option value="percent">Percentage off the order</option>
            <option value="fixed">Fixed amount off the order</option>
          </Field>
          <Field
            label={isPercent ? "Percentage off (%)" : `Amount off (${symbol})`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.value}
            onChange={set("value")}
            error={errors.value}
          />
        </div>

        <Field
          label={`Minimum order (${symbol})`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.min_order_amount}
          onChange={set("min_order_amount")}
          error={errors.min_order_amount}
          hint="The order must reach this amount before the code works. Use 0 for no minimum."
        />

        <div className="form-row form-row--2">
          <Field
            label="Starts (optional)"
            type="datetime-local"
            value={form.starts_at}
            onChange={set("starts_at")}
            error={errors.starts_at}
            hint="Leave empty to start straight away."
          />
          <Field
            label="Ends (optional)"
            type="datetime-local"
            value={form.ends_at}
            onChange={set("ends_at")}
            error={errors.ends_at}
            hint="Leave empty to never expire."
          />
        </div>

        <Field
          label="Usage limit (optional)"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={form.usage_limit}
          onChange={set("usage_limit")}
          error={errors.usage_limit}
          hint="How many sales can use this code in total. Leave empty for no limit."
        />

        {discount && (
          <p className="info-note">
            Used <strong>{discount.times_used}</strong>{" "}
            {discount.times_used === 1 ? "time" : "times"} so far. Changing a
            promo never changes sales that are already recorded.
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
          >
            Cancel
          </button>
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : discount ? "Save changes" : "Add promo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
