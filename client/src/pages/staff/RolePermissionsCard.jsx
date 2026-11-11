import { useState } from "react";
import Modal from "../../components/ui/Modal";
import Field from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { useRpcQuery } from "../../hooks/useRpcQuery";
import {
  LOCKED_ADMIN_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  assignableRoles,
} from "../../config/permissions";
import {
  getRolePermissions,
  restoreRolePermissions,
  saveRolePermissions,
} from "../../data/staff";
import "../../styles/staff.css";

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export default function RolePermissionsCard({ businessId }) {
  const { isOwner } = useAuth();
  const roles = assignableRoles(isOwner);
  const query = useRpcQuery(() => getRolePermissions(businessId), [businessId]);
  const [role, setRole] = useState("manager");
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);

  const saved = query.data?.[role];
  const checked = edits[role] ?? saved ?? [];
  const dirty = !!edits[role] && !!saved && !sameSet(edits[role], saved);
  const isLocked = (key) =>
    role === "admin" && LOCKED_ADMIN_PERMISSIONS.includes(key);

  function pickRole(next) {
    setRole(next);
    setError("");
    setDone("");
  }

  function toggle(key) {
    if (isLocked(key)) return;
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEdits((prev) => ({ ...prev, [role]: [...next] }));
    setDone("");
  }

  function discard() {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
    setError("");
  }

  async function save() {
    setBusy(true);
    setError("");
    const { error: err } = await saveRolePermissions(businessId, role, checked);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(`${ROLE_LABELS[role]} permissions saved.`);
    query.reload();
  }

  async function restore() {
    setBusy(true);
    setError("");
    const { error: err } = await restoreRolePermissions(businessId, role);
    setBusy(false);
    setConfirmRestore(false);
    if (err) {
      setError(err);
      return;
    }
    discard();
    setDone(`${ROLE_LABELS[role]} permissions restored to the defaults.`);
    query.reload();
  }

  return (
    <section className="card" aria-labelledby="st-roles">
      <h2 className="card__title" id="st-roles">
        Role permissions
      </h2>
      <p className="card__sub">
        Choose what each role can do. The owner always has every permission.
        {!isOwner && " Only the owner can change what admins can do."}
      </p>

      <div className="st-role-pick st-gap">
        <Field
          label="Role"
          as="select"
          value={role}
          onChange={(e) => pickRole(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Field>
      </div>

      {query.loading && !query.data ? (
        <p className="st-spin">
          <span className="spinner" /> Loading permissions…
        </p>
      ) : query.error && !query.data ? (
        <div className="stack st-gap">
          <p className="alert alert--danger" role="alert">
            {query.error}
          </p>
          <div className="st-actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={query.reload}
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="st-perm-wrap">
          {PERMISSION_GROUPS.map((group) => (
            <div className="st-perm-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="st-perm-list">
                {group.items.map((item) => {
                  const locked = isLocked(item.key);
                  return (
                    <label
                      className={`st-perm${locked ? " st-perm--locked" : ""}`}
                      key={item.key}
                    >
                      <input
                        type="checkbox"
                        checked={checked.includes(item.key)}
                        disabled={locked || busy}
                        onChange={() => toggle(item.key)}
                      />
                      <span className="st-perm__text">
                        <span className="st-perm__label">
                          {item.label}
                          {locked ? " (always on)" : ""}
                        </span>
                        <span className="st-perm__desc">
                          {item.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {error && (
            <p className="alert alert--danger st-gap" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="alert alert--success st-gap" role="status">
              {done}
            </p>
          )}

          <div className="st-savebar">
            <button
              type="button"
              className="btn btn--primary"
              onClick={save}
              disabled={!dirty || busy}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={discard}
              disabled={!dirty || busy}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmRestore(true)}
              disabled={busy}
            >
              Restore defaults
            </button>
          </div>
          <p className="info-note st-gap">
            People who are already signed in see permission changes after they
            refresh the page.
          </p>
        </div>
      )}

      <Modal
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        title={`Restore ${ROLE_LABELS[role]} defaults?`}
      >
        {confirmRestore && (
          <div className="stack">
            <p>
              This replaces everything ticked for {ROLE_LABELS[role]} with the
              standard set, including any changes you have not saved.
            </p>
            <div className="st-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={restore}
                disabled={busy}
              >
                {busy ? "Restoring…" : "Restore defaults"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmRestore(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
