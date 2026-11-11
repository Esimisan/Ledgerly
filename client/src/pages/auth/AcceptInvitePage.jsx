import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useRpcQuery } from "../../hooks/useRpcQuery";
import { formatDate } from "../../lib/format";
import {
  clearPendingInvite,
  readPendingInvite,
  savePendingInvite,
} from "../../lib/invite";
import { ROLE_LABELS } from "../../config/permissions";
import { acceptInvitation, previewInvitation } from "../../data/staff";
import "../../styles/staff.css";

const NONE = { data: null, error: "" };

const PROBLEMS = {
  not_found: "This invitation link is not valid.",
  accepted: "This invitation has already been used.",
  revoked: "This invitation was revoked. Ask the business owner for a new one.",
  expired: "This invitation has expired. Ask the business owner for a new one.",
};

function Shell({ title, sub, children }) {
  return (
    <div className="st-gate">
      <section className="card st-gate__card">
        <h1 className="card__title">{title}</h1>
        {sub && <p className="card__sub">{sub}</p>}
        {children}
      </section>
    </div>
  );
}

export default function AcceptInvitePage() {
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlToken = params.get("token");
  const token = urlToken || readPendingInvite();
  const signedIn = status === "needsBusiness" || status === "ready";
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (urlToken) savePendingInvite(urlToken);
  }, [urlToken]);

  const preview = useRpcQuery(
    () =>
      token && signedIn ? previewInvitation(token) : Promise.resolve(NONE),
    [token, signedIn],
  );
  const info = preview.data;

  useEffect(() => {
    if (info && info.state !== "pending") clearPendingInvite();
  }, [info]);

  async function accept() {
    setAccepting(true);
    setError("");
    const { error: err } = await acceptInvitation(token);
    if (err) {
      setAccepting(false);
      setError(err);
      return;
    }
    clearPendingInvite();
    window.location.assign("/"); // reload so the app picks up the new membership
  }

  function dismiss() {
    clearPendingInvite();
    navigate("/", { replace: true });
  }

  if (!token) {
    return (
      <Shell
        title="No invitation found"
        sub="Open the invite link you were sent, or ask the business owner for a new one."
      >
        <div className="st-actions st-gap">
          <Link className="btn btn--primary" to="/">
            Go to Ledgerly
          </Link>
        </div>
      </Shell>
    );
  }

  if (status === "loading") {
    return (
      <Shell title="Invitation">
        <p className="st-spin">
          <span className="spinner" /> Loading…
        </p>
      </Shell>
    );
  }

  if (!signedIn) {
    return (
      <Shell
        title="You have been invited"
        sub="Sign in, or create an account, using the email address the invitation was sent to. You will come back here to join."
      >
        <div className="st-actions st-gap">
          <Link className="btn btn--primary" to="/signup">
            Create account
          </Link>
          <Link className="btn btn--secondary" to="/login">
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (preview.loading && !info) {
    return (
      <Shell title="Invitation">
        <p className="st-spin">
          <span className="spinner" /> Checking your invitation…
        </p>
      </Shell>
    );
  }

  if (preview.error || !info || info.state !== "pending") {
    return (
      <Shell title="This invitation cannot be used">
        <p className="alert alert--danger" role="alert">
          {preview.error || PROBLEMS[info?.state] || PROBLEMS.not_found}
        </p>
        <div className="st-actions st-gap">
          <button type="button" className="btn btn--primary" onClick={dismiss}>
            Continue
          </button>
        </div>
      </Shell>
    );
  }

  if (!info.email_matches) {
    return (
      <Shell
        title="Wrong account"
        sub={`This invitation was sent to ${info.email}.`}
      >
        <p className="alert alert--danger" role="alert">
          You are signed in as {user?.email}. Sign out, then sign in or sign up
          with {info.email}.
        </p>
        <div className="st-actions st-gap">
          <button type="button" className="btn btn--primary" onClick={signOut}>
            Sign out
          </button>
          <button type="button" className="btn btn--ghost" onClick={dismiss}>
            Not now
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title={`Join ${info.business_name}`}
      sub="You have been invited to this business on Ledgerly."
    >
      <dl className="st-facts">
        <div>
          <dt>Business</dt>
          <dd>{info.business_name}</dd>
        </div>
        <div>
          <dt>Your role</dt>
          <dd>{ROLE_LABELS[info.role]}</dd>
        </div>
        <div>
          <dt>Link expires</dt>
          <dd>{formatDate(info.expires_at)}</dd>
        </div>
      </dl>
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions st-gap">
        <button
          type="button"
          className="btn btn--primary"
          onClick={accept}
          disabled={accepting}
        >
          {accepting ? "Joining…" : "Accept invitation"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </Shell>
  );
}
