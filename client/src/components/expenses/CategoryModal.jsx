import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  categoryError,
  createCategory,
  renameCategory,
} from "../../data/expenseCategories";

// category = null means "add"; a category row means "rename".
export default function CategoryModal({
  open,
  onClose,
  businessId,
  category,
  onSaved,
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [nameError, setNameError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter a category name.");
      return;
    }
    if (category && trimmed === category.name) {
      onClose(); // nothing changed, so nothing to save
      return;
    }
    setNameError("");
    setError("");
    setBusy(true);
    const { error: err } = category
      ? await renameCategory(category.id, businessId, trimmed)
      : await createCategory(businessId, trimmed);
    setBusy(false);

    if (err) {
      // A duplicate name belongs next to the field; anything else goes in the banner.
      if (err.code === "23505") setNameError(categoryError(err));
      else setError(categoryError(err));
      return;
    }
    onSaved(category ? "Category renamed." : "Category added.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Rename category" : "Add category"}
    >
      <form className="stack" onSubmit={submit}>
        <Field
          label="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          hint={
            category
              ? "Past expenses will show the new name."
              : "Up to 60 characters. Two categories cannot share a name, even with different capital letters."
          }
          maxLength={60}
          placeholder="e.g. Packaging"
          autoFocus
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
            {busy ? "Saving…" : category ? "Save name" : "Add category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
