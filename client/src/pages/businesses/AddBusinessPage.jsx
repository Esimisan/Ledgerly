import { useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { CURRENCIES, TIMEZONES } from "../../config/currencies";
import "../../styles/switcher.css";

export default function AddBusinessPage() {
  const { createBusiness } = useAuth();
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
      // Success: the app switches to the new business and this page is replaced.
    } catch (err) {
      setError(
        err.message || "Could not create the business. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Add another business"
        subtitle="Each business has its own products, sales, staff and settings."
      />
      <section className="card bs-form">
        <form className="stack" onSubmit={onSubmit} noValidate>
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
          <p className="info-note">
            You will be the owner of the new business. Your role in your other
            businesses does not change, and nothing is shared between them.
          </p>
          <div className="bs-actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || !form.name.trim()}
            >
              {busy ? "Creating…" : "Create business"}
            </button>
            <Link className="btn btn--ghost" to="/">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
