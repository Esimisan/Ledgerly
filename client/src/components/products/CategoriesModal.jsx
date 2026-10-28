import { useState } from "react";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import {
  categoryError,
  createCategory,
  updateCategory,
} from "../../data/categories";

export default function CategoriesModal({
  open,
  onClose,
  businessId,
  categories,
  onChanged,
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Runs a request, shows its error if any, refreshes the list on success. Returns true on success.
  async function run(request) {
    setError("");
    setBusy(true);
    const { error: err } = await request();
    setBusy(false);
    if (err) {
      setError(categoryError(err));
      return false;
    }
    onChanged();
    return true;
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await run(() => createCategory(businessId, name.trim()))) setName("");
  }

  async function saveRename(id) {
    if (!editName.trim()) return;
    if (
      await run(() => updateCategory(id, businessId, { name: editName.trim() }))
    )
      setEditingId(null);
  }

  const toggle = (c) =>
    run(() => updateCategory(c.id, businessId, { is_active: !c.is_active }));

  return (
    <Modal open={open} onClose={onClose} title="Categories">
      <div className="stack">
        <form className="add-row" onSubmit={add}>
          <Field
            label="New category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Clothing"
          />
          <button
            className="btn btn--primary add-row__btn"
            disabled={busy || !name.trim()}
          >
            Add
          </button>
        </form>

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {categories.length === 0 ? (
          <p className="card__sub">
            No categories yet. Add your first one above.
          </p>
        ) : (
          <ul className="cat-list">
            {categories.map((c) => (
              <li key={c.id} className="cat-item">
                {editingId === c.id ? (
                  <>
                    <input
                      className="input"
                      aria-label={`Rename ${c.name}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy}
                      onClick={() => saveRename(c.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="cat-item__name">{c.name}</span>
                    {!c.is_active && (
                      <span className="badge badge--warning">Inactive</span>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => toggle(c)}
                    >
                      {c.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
