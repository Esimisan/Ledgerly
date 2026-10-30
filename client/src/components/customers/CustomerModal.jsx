import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  createCustomer,
  updateCustomer,
  customerError,
} from "../../data/customers";

const EMPTY = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  discount_percent: "0",
};

// customer = null means "add"; a customer row means "edit".
// canSetDiscount = the user has discounts.manage (the database enforces it too).
export default function CustomerModal({
  open,
  onClose,
  businessId,
  customer,
  canSetDiscount,
  onSaved,
}) {
  const [form, setForm] = useState(() =>
    customer
      ? {
          name: customer.name ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          address: customer.address ?? "",
          notes: customer.notes ?? "",
          discount_percent: String(customer.discount_percent ?? 0),
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = "Enter the customer's name.";
    const email = form.email.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      next.email = "Enter a valid email address.";
    if (form.phone.trim() && !/\d/.test(form.phone))
      next.phone = "Enter a phone number with at least one digit.";
    if (canSetDiscount) {
      const d = Number(form.discount_percent || 0);
      if (Number.isNaN(d) || d < 0 || d > 100)
        next.discount_percent = "Enter a number from 0 to 100.";
    }
    return next;
  }

  async function submit(e) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setError("");
    if (Object.keys(found).length) return;

    setBusy(true);
    const { error: err } = customer
      ? await updateCustomer(customer.id, businessId, form, canSetDiscount)
      : await createCustomer(businessId, form, canSetDiscount);
    setBusy(false);

    if (err) {
      const { field, message } = customerError(err);
      if (field) setErrors({ [field]: message });
      else setError(message);
      return;
    }
    onSaved(customer ? "Customer updated." : "Customer added.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Edit customer" : "Add customer"}
    >
      <form className="stack" onSubmit={submit} noValidate>
        <Field
          label="Name"
          value={form.name}
          onChange={set("name")}
          error={errors.name}
          maxLength={120}
          placeholder="e.g. Ada Okafor"
        />

        <div className="form-row form-row--2">
          <Field
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            error={errors.phone}
            maxLength={40}
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={set("email")}
            error={errors.email}
            maxLength={160}
          />
        </div>

        <Field
          label="Address"
          value={form.address}
          onChange={set("address")}
          maxLength={240}
        />

        {canSetDiscount ? (
          <Field
            label="Discount level (%)"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.01"
            value={form.discount_percent}
            onChange={set("discount_percent")}
            error={errors.discount_percent}
            hint="Applied automatically to this customer's sales."
          />
        ) : (
          customer && (
            <p className="info-note">
              Discount level:{" "}
              <strong>{Number(customer.discount_percent)}%</strong>. Only a
              manager, admin or the owner can change it.
            </p>
          )
        )}

        <Field
          as="textarea"
          label="Notes"
          hint="Delivery details, preferences, anything worth remembering."
          rows={3}
          value={form.notes}
          onChange={set("notes")}
          maxLength={1000}
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
          >
            Cancel
          </button>
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : customer ? "Save changes" : "Add customer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
