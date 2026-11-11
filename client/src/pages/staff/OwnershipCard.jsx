import { useState } from "react";
import Modal from "../../components/ui/Modal";
import Field from "../../components/ui/Field";
import { transferOwnership } from "../../data/staff";
import "../../styles/staff.css";

function TransferForm({ business, admins, onCancel }) {
  const [target, setTarget] = useState(admins[0].user_id);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const matches =
    typed.trim().toLowerCase() === business.name.trim().toLowerCase();

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { error: err } = await transferOwnership(business.id, target, typed);
    if (err) {
      setSaving(false);
      setError(err);
      return;
    }
    window.location.reload(); // your role just changed, so reload everything
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p>
        The new owner gets full control, including the power to suspend you. You
        become an admin. You cannot undo this yourself.
      </p>
      <Field
        label="New owner"
        as="select"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        {admins.map((a) => (
          <option key={a.user_id} value={a.user_id}>
            {a.full_name} ({a.email})
          </option>
        ))}
      </Field>
      <Field
        label={`Type "${business.name}" to confirm`}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
      />
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions">
        <button
          type="submit"
          className="btn btn--danger"
          disabled={!matches || saving}
        >
          {saving ? "Transferring…" : "Transfer ownership"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function OwnershipCard({ business, members }) {
  const [open, setOpen] = useState(false);
  const admins = (members ?? []).filter(
    (m) => m.role === "admin" && m.status === "active",
  );

  return (
    <section className="card st-danger" aria-labelledby="st-owner">
      <h2 className="card__title" id="st-owner">
        Transfer ownership
      </h2>
      <p className="card__sub">
        Hand this business to an active admin. There is always exactly one
        owner.
      </p>
      {admins.length === 0 ? (
        <p className="info-note st-gap">
          Make someone an admin first. Ownership can only go to an active admin.
        </p>
      ) : (
        <div className="st-actions st-gap">
          <button
            type="button"
            className="btn btn--danger-outline"
            onClick={() => setOpen(true)}
          >
            Transfer ownership…
          </button>
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Transfer ownership"
      >
        {open && admins.length > 0 && (
          <TransferForm
            business={business}
            admins={admins}
            onCancel={() => setOpen(false)}
          />
        )}
      </Modal>
    </section>
  );
}
