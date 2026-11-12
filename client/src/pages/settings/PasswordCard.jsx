import { useState } from "react";
import Field from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { changePassword } from "../../data/settings";

const EMPTY = { current: "", next: "", confirm: "" };

export default function PasswordCard() {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const errors = {};
  if (!form.current) errors.current = "Enter your current password.";
  if (form.next.length < 8) errors.next = "Use at least 8 characters.";
  else if (form.next === form.current)
    errors.next = "Choose a password different from the current one.";
  if (form.confirm !== form.next)
    errors.confirm = "The passwords do not match.";

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDone(false);
  };
  const err = (key) => (showErrors ? errors[key] : undefined);

  async function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    setDone(false);
    setError("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    const res = await changePassword({
      email: user.email,
      current: form.current,
      next: form.next,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setForm(EMPTY);
    setShowErrors(false);
    setDone(true);
  }

  return (
    <section className="card" aria-labelledby="se-password">
      <h2 className="card__title" id="se-password">
        Password
      </h2>
      <p className="card__sub">
        Enter your current password first, then choose a new one.
      </p>
      <form className="se-form" onSubmit={submit} noValidate>
        <div className="se-fields">
          <div className="se-grid">
            <div className="se-span">
              <Field
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={form.current}
                onChange={set("current")}
                error={err("current")}
              />
            </div>
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              value={form.next}
              onChange={set("next")}
              error={err("next")}
              hint="At least 8 characters."
            />
            <Field
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
              error={err("confirm")}
            />
          </div>
        </div>
        {error && (
          <p className="alert alert--danger" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="alert alert--success" role="status">
            Password changed.
          </p>
        )}
        <div className="se-actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
