import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../../components/layout/AuthLayout";
import Field from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { friendlyAuthError } from "../../lib/authErrors";

export default function Signup() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8)
      return setError("Use at least 8 characters for your password.");
    if (form.password !== form.confirm)
      return setError("The two passwords do not match.");

    setBusy(true);
    try {
      const { needsConfirmation } = await signUp({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      // Confirmation off: a session exists, GuestOnly sends them to onboarding.
      if (needsConfirmation) setSentTo(form.email.trim());
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We sent a confirmation link to ${sentTo}. Open it to activate your account.`}
        footer={
          <>
            Already confirmed? <Link to="/login">Sign in</Link>
          </>
        }
      />
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start managing your business in minutes"
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}
        <Field
          label="Full name"
          autoComplete="name"
          required
          value={form.fullName}
          onChange={set("fullName")}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set("email")}
        />
        <div className="form-row form-row--2">
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters"
            value={form.password}
            onChange={set("password")}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set("confirm")}
          />
        </div>
        <button
          className="btn btn--primary btn--block"
          disabled={busy || !form.fullName || !form.email || !form.password}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
