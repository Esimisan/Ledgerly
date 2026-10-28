import { useState } from "react";
import { Navigate } from "react-router-dom";
import AuthLayout from "../../components/layout/AuthLayout";
import Field from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { CURRENCIES, TIMEZONES } from "../../config/currencies";

export default function Onboarding() {
  const { status, user, createBusiness, signOut } = useAuth();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    currency: "NGN",
    timezone: "Africa/Lagos",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const currency = CURRENCIES.find((c) => c.code === form.currency);
      await createBusiness({
        name: form.name.trim(),
        phone: form.phone.trim(),
        currencyCode: currency.code,
        currencySymbol: currency.symbol,
        timezone: form.timezone,
      });
    } catch (err) {
      setError(
        err.message || "Could not create your business. Please try again.",
      );
      setBusy(false);
    }
  }

  if (status === "ready") return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Create your business"
      subtitle="Tell us a little about it. You can change these later."
      footer={
        <>
          Signed in as {user?.email}. Not you?{" "}
          <button type="button" className="link-btn" onClick={signOut}>
            Sign out
          </button>
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
          label="Business name"
          required
          value={form.name}
          onChange={set("name")}
        />
        <Field
          label="Business phone (optional)"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={set("phone")}
        />
        <div className="form-row form-row--2">
          <Field
            as="select"
            label="Currency"
            value={form.currency}
            onChange={set("currency")}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Field>
          <Field
            as="select"
            label="Timezone"
            value={form.timezone}
            onChange={set("timezone")}
          >
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Field>
        </div>
        <button
          className="btn btn--primary btn--block"
          disabled={busy || !form.name.trim()}
        >
          {busy ? "Creating…" : "Create business"}
        </button>
      </form>
    </AuthLayout>
  );
}
