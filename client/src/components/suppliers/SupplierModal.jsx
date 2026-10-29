import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  createSupplier,
  updateSupplier,
  supplierError,
} from "../../data/suppliers";

const EMPTY = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

// supplier = null means "add"; a supplier row means "edit".
export default function SupplierModal({
  open,
  onClose,
  businessId,
  supplier,
  onSaved,
}) {
  const [form, setForm] = useState(() =>
    supplier
      ? {
          name: supplier.name ?? "",
          contact_name: supplier.contact_name ?? "",
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
          address: supplier.address ?? "",
          notes: supplier.notes ?? "",
        }
      : EMPTY,
  );
  const [nameError, setNameError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setNameError("Enter the supplier's name.");
      return;
    }
    setNameError("");
    setError("");
    setBusy(true);
    const { error: err } = supplier
      ? await updateSupplier(supplier.id, businessId, form)
      : await createSupplier(businessId, form);
    setBusy(false);

    if (err) {
      // A duplicate name belongs next to the name field; anything else goes in the banner.
      if (err.code === "23505") setNameError(supplierError(err));
      else setError(supplierError(err));
      return;
    }
    onSaved(supplier ? "Supplier updated." : "Supplier added.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? "Edit supplier" : "Add supplier"}
    >
      <form className="stack" onSubmit={submit}>
        <Field
          label="Supplier name"
          value={form.name}
          onChange={set("name")}
          error={nameError}
          maxLength={120}
          placeholder="e.g. Lagos Textile Wholesale"
        />

        <div className="form-row form-row--2">
          <Field
            label="Contact person"
            value={form.contact_name}
            onChange={set("contact_name")}
            maxLength={120}
          />
          <Field
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            maxLength={40}
          />
        </div>

        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={set("email")}
          maxLength={160}
        />

        <Field
          label="Address"
          value={form.address}
          onChange={set("address")}
          maxLength={240}
        />

        <Field
          as="textarea"
          label="Notes"
          hint="Payment terms, delivery days, anything worth remembering."
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
            {busy ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
