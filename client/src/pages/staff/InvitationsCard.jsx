import { useState } from "react";
import { Mail } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Field from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { useRpcQuery } from "../../hooks/useRpcQuery";
import { formatDate } from "../../lib/format";
import { inviteLink } from "../../lib/invite";
import {
  INVITE_EXPIRY,
  ROLE_LABELS,
  assignableRoles,
} from "../../config/permissions";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from "../../data/staff";
import "../../styles/staff.css";

const STATUS_BADGE = {
  pending: ["Pending", "badge--warning"],
  accepted: ["Accepted", "badge--success"],
  revoked: ["Revoked", "badge--danger"],
  expired: ["Expired", "badge--danger"],
};

function CopyButton({ link, small }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      className={`btn btn--secondary${small ? " btn--sm" : ""}`}
      onClick={copy}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function InviteForm({ businessId, roles, onCreated, onClose }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[roles.length - 1]);
  const [days, setDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { data, error: err } = await createInvitation(
      businessId,
      email,
      role,
      days,
    );
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setCreated(data);
    onCreated();
  }

  if (created) {
    const link = inviteLink(created.token);
    return (
      <div className="stack">
        <p>
          Invitation created for <strong>{email.trim().toLowerCase()}</strong>.
          No email is sent, so copy this link and send it to them yourself. They
          must sign up or sign in with that same email, then open the link.
        </p>
        <div className="st-linkbox">
          <Field
            label="Invite link"
            value={link}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <CopyButton link={link} />
        </div>
        <div className="st-actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="off"
        required
      />
      <Field
        label="Role"
        as="select"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Field>
      <Field
        label="Link works for"
        as="select"
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
      >
        {INVITE_EXPIRY.map((o) => (
          <option key={o.days} value={o.days}>
            {o.label}
          </option>
        ))}
      </Field>
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? "Creating…" : "Create invitation"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RevokeForm({ invitation, businessId, onDone, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setSaving(true);
    setError("");
    const { error: err } = await revokeInvitation(businessId, invitation.id);
    setSaving(false);
    if (err) setError(err);
    else onDone();
  }
  return (
    <div className="stack">
      <p>The link sent to {invitation.email} will stop working immediately.</p>
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions">
        <button
          type="button"
          className="btn btn--danger"
          onClick={confirm}
          disabled={saving}
        >
          {saving ? "Revoking…" : "Revoke invitation"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Keep it
        </button>
      </div>
    </div>
  );
}

export default function InvitationsCard({ businessId }) {
  const { isOwner } = useAuth();
  const query = useRpcQuery(() => listInvitations(businessId), [businessId]);
  const [inviting, setInviting] = useState(false);
  const [revokeFor, setRevokeFor] = useState(null);
  const rows = query.data ?? [];

  return (
    <section className="card" aria-labelledby="st-invites">
      <div className="st-toolbar">
        <div>
          <h2 className="card__title" id="st-invites">
            Invitations
          </h2>
          <p className="card__sub">
            No emails are sent. Copy an invite link and send it yourself. Each
            link works once.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setInviting(true)}
        >
          Invite someone
        </button>
      </div>

      {query.loading && !query.data ? (
        <p className="st-spin">
          <span className="spinner" /> Loading invitations…
        </p>
      ) : query.error && !query.data ? (
        <div className="stack">
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
      ) : rows.length === 0 ? (
        <p className="empty">
          No invitations yet. Use Invite someone to add a teammate.
        </p>
      ) : (
        <ul className="st-list">
          {rows.map((inv) => {
            const [label, tone] = STATUS_BADGE[inv.status] ?? [inv.status, ""];
            const pending = inv.status === "pending";
            return (
              <li className="st-row" key={inv.id}>
                <div className="st-row__who">
                  <span className="st-avatar" aria-hidden="true">
                    <Mail size={16} />
                  </span>
                  <div className="st-who">
                    <div className="st-name">{inv.email}</div>
                    <div className="st-email">
                      Sent {formatDate(inv.created_at)} by {inv.invited_by_name}
                    </div>
                  </div>
                </div>
                <div className="st-meta">
                  <span className="badge">{ROLE_LABELS[inv.role]}</span>
                  <span className={`badge ${tone}`}>{label}</span>
                  {pending && (
                    <span className="st-joined">
                      Expires {formatDate(inv.expires_at)}
                    </span>
                  )}
                </div>
                <div className="st-actions">
                  {pending && inv.token && (
                    <CopyButton small link={inviteLink(inv.token)} />
                  )}
                  {pending && (isOwner || inv.role !== "admin") && (
                    <button
                      type="button"
                      className="btn btn--danger-outline btn--sm"
                      onClick={() => setRevokeFor(inv)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite someone"
      >
        {inviting && (
          <InviteForm
            businessId={businessId}
            roles={assignableRoles(isOwner)}
            onCreated={query.reload}
            onClose={() => setInviting(false)}
          />
        )}
      </Modal>

      <Modal
        open={!!revokeFor}
        onClose={() => setRevokeFor(null)}
        title="Revoke this invitation?"
      >
        {revokeFor && (
          <RevokeForm
            invitation={revokeFor}
            businessId={businessId}
            onDone={() => {
              setRevokeFor(null);
              query.reload();
            }}
            onCancel={() => setRevokeFor(null)}
          />
        )}
      </Modal>
    </section>
  );
}
