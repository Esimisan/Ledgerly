import { useState } from "react";
import Modal from "../../components/ui/Modal";
import Field from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { formatDate } from "../../lib/format";
import { ROLE_LABELS, assignableRoles } from "../../config/permissions";
import { setMemberRole, setMemberStatus } from "../../data/staff";
import "../../styles/staff.css";

function RoleForm({ member, businessId, roles, onDone, onCancel }) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { error: err } = await setMemberRole(
      businessId,
      member.user_id,
      role,
    );
    setSaving(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field
        label="Role"
        as="select"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        hint="Role permissions are edited further down this page."
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Field>
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={saving || role === member.role}
        >
          {saving ? "Saving…" : "Save role"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function StatusForm({ member, businessId, onDone, onCancel }) {
  const suspending = member.status === "active";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setSaving(true);
    setError("");
    const { error: err } = await setMemberStatus(
      businessId,
      member.user_id,
      suspending ? "suspended" : "active",
    );
    setSaving(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <div className="stack">
      <p>
        {suspending
          ? `${member.full_name} will not be able to use this business until you reactivate them. Their records and history are kept. If they are signed in now, the block applies when they refresh.`
          : `${member.full_name} will be able to use this business again with their ${ROLE_LABELS[member.role]} role.`}
      </p>
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions">
        <button
          type="button"
          className={suspending ? "btn btn--danger" : "btn btn--primary"}
          onClick={confirm}
          disabled={saving}
        >
          {saving ? "Saving…" : suspending ? "Suspend" : "Reactivate"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MembersCard({ businessId, query }) {
  const { isOwner } = useAuth();
  const [roleFor, setRoleFor] = useState(null);
  const [statusFor, setStatusFor] = useState(null);
  const members = query.data ?? [];

  function done(close) {
    close(null);
    query.reload();
  }

  return (
    <section className="card" aria-labelledby="st-members">
      <h2 className="card__title" id="st-members">
        Team members
      </h2>
      <p className="card__sub">
        Everyone with access to this business. People are suspended, never
        deleted.
      </p>

      {query.loading && !query.data ? (
        <p className="st-spin">
          <span className="spinner" /> Loading team…
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
        <ul className="st-list st-gap">
          {members.map((m) => (
            <li className="st-row" key={m.user_id}>
              <div className="st-row__who">
                <span className="st-avatar" aria-hidden="true">
                  {(m.full_name || "?").trim().charAt(0).toUpperCase()}
                </span>
                <div className="st-who">
                  <div className="st-name">
                    {m.full_name}
                    {m.is_me ? " (you)" : ""}
                  </div>
                  <div className="st-email">{m.email}</div>
                </div>
              </div>
              <div className="st-meta">
                <span className="badge">{ROLE_LABELS[m.role]}</span>
                <span
                  className={`badge ${m.status === "active" ? "badge--success" : "badge--warning"}`}
                >
                  {m.status === "active" ? "Active" : "Suspended"}
                </span>
                <span className="st-joined">
                  Joined {formatDate(m.joined_at)}
                </span>
              </div>
              <div className="st-actions">
                {m.can_manage && (
                  <>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setRoleFor(m)}
                    >
                      Change role
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${m.status === "active" ? "btn--danger-outline" : "btn--secondary"}`}
                      onClick={() => setStatusFor(m)}
                    >
                      {m.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!roleFor}
        onClose={() => setRoleFor(null)}
        title={roleFor ? `Change role for ${roleFor.full_name}` : "Change role"}
      >
        {roleFor && (
          <RoleForm
            member={roleFor}
            businessId={businessId}
            roles={assignableRoles(isOwner)}
            onDone={() => done(setRoleFor)}
            onCancel={() => setRoleFor(null)}
          />
        )}
      </Modal>

      <Modal
        open={!!statusFor}
        onClose={() => setStatusFor(null)}
        title={
          statusFor
            ? `${statusFor.status === "active" ? "Suspend" : "Reactivate"} ${statusFor.full_name}?`
            : "Confirm"
        }
      >
        {statusFor && (
          <StatusForm
            member={statusFor}
            businessId={businessId}
            onDone={() => done(setStatusFor)}
            onCancel={() => setStatusFor(null)}
          />
        )}
      </Modal>
    </section>
  );
}
