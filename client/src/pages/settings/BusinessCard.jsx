import { useState } from "react";
import Field from "../../components/ui/Field";
import ImagePicker from "../../components/settings/ImagePicker";
import { CURRENCIES, TIMEZONES } from "../../config/currencies";
import { saveBusinessSettings } from "../../data/settings";
import { useImageDraft, useSignedUrl } from "../../hooks/useSettingsImages";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function toForm(b) {
  return {
    name: b.name ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    address: b.address ?? "",
    currency: b.currency_code ?? "NGN",
    timezone: b.timezone ?? "Africa/Lagos",
    tax: String(b.default_tax_rate ?? 0),
    lowStock: String(b.low_stock_default ?? 0),
    footer: b.receipt_footer ?? "",
  };
}

const same = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = "Business name is required.";
  if (f.email.trim() && !EMAIL.test(f.email.trim()))
    e.email = "Enter a valid email address.";
  const tax = Number(f.tax);
  if (f.tax.trim() === "" || !Number.isFinite(tax) || tax < 0 || tax > 100)
    e.tax = "Enter a rate between 0 and 100.";
  const low = Number(f.lowStock);
  if (f.lowStock.trim() === "" || !Number.isFinite(low) || low < 0)
    e.lowStock = "Enter 0 or more.";
  return e;
}

export default function BusinessCard({ business, onSaved }) {
  const saved = toForm(business);
  const [form, setForm] = useState(saved);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const logo = useImageDraft();
  const logoUrl = useSignedUrl("logos", business.logo_path);

  const errors = validate(form);
  const dirty = !same(form, saved) || Boolean(logo.blob) || logo.removed;
  const shownLogo = logo.url || (logo.removed ? "" : logoUrl);
  const hasLogo = Boolean(logo.url || (!logo.removed && business.logo_path));

  const currencies = CURRENCIES.some((c) => c.code === business.currency_code)
    ? CURRENCIES
    : [
        {
          code: business.currency_code,
          symbol: business.currency_symbol,
          label: `${business.currency_code} (${business.currency_symbol})`,
        },
        ...CURRENCIES,
      ];
  const timezones = TIMEZONES.includes(business.timezone)
    ? TIMEZONES
    : [business.timezone, ...TIMEZONES];

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDone(false);
  };
  const err = (key) => (showErrors ? errors[key] : undefined);

  function discard() {
    setForm(saved);
    logo.reset();
    setShowErrors(false);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    setDone(false);
    setError("");
    if (Object.keys(errors).length) return;

    const cur =
      currencies.find((c) => c.code === form.currency) ?? currencies[0];
    const clean = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      currency: cur.code,
      timezone: form.timezone,
      tax: String(Number(form.tax)),
      lowStock: String(Number(form.lowStock)),
      footer: form.footer.trim(),
    };
    setSaving(true);
    const res = await saveBusinessSettings({
      businessId: business.id,
      fields: {
        name: clean.name,
        phone: clean.phone || null,
        email: clean.email || null,
        address: clean.address || null,
        currency_code: cur.code,
        currency_symbol: cur.symbol,
        timezone: clean.timezone,
        default_tax_rate: Number(clean.tax),
        low_stock_default: Number(clean.lowStock),
        receipt_footer: clean.footer || null,
      },
      newLogo: logo.blob ? { blob: logo.blob, ext: logo.ext } : null,
      removeLogo: logo.removed,
      previousPath: business.logo_path,
    });
    if (res.error) {
      setSaving(false);
      setError(res.error);
      return;
    }
    await onSaved();
    setForm(clean);
    logo.reset();
    setSaving(false);
    setShowErrors(false);
    setDone(true);
  }

  return (
    <section className="card" aria-labelledby="se-business">
      <h2 className="card__title" id="se-business">
        Business details
      </h2>
      <p className="card__sub">
        Used across the app and on receipts. Changes are recorded in the audit
        log.
      </p>

      <form className="se-form" onSubmit={submit} noValidate>
        <ImagePicker
          label="Business logo"
          url={shownLogo}
          fallback={(form.name.trim().charAt(0) || "?").toUpperCase()}
          hasImage={hasLogo}
          onPick={logo.pick}
          onRemove={logo.remove}
          error={logo.error}
          disabled={saving}
        />

        <div className="se-fields">
          <div className="se-grid">
            <Field
              label="Business name"
              value={form.name}
              onChange={set("name")}
              error={err("name")}
              maxLength={120}
              autoComplete="organization"
            />
            <Field
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={set("phone")}
              maxLength={40}
              autoComplete="tel"
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={set("email")}
              error={err("email")}
              autoComplete="email"
            />
            <Field
              label="Address"
              value={form.address}
              onChange={set("address")}
              maxLength={300}
              autoComplete="street-address"
            />
            <Field
              label="Currency"
              as="select"
              value={form.currency}
              onChange={set("currency")}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Field>
            <Field
              label="Timezone"
              as="select"
              value={form.timezone}
              onChange={set("timezone")}
            >
              {timezones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Field>
            <Field
              label="Default tax rate (%)"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={form.tax}
              onChange={set("tax")}
              error={err("tax")}
            />
            <Field
              label="Low-stock default"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={form.lowStock}
              onChange={set("lowStock")}
              error={err("lowStock")}
              hint="Default minimum stock level."
            />
            <div className="se-span">
              <Field
                label="Receipt footer"
                value={form.footer}
                onChange={set("footer")}
                maxLength={300}
                hint="Printed at the bottom of receipts."
              />
            </div>
          </div>
        </div>

        <p className="info-note">
          Changing the currency changes the symbol shown on screens, reports and
          receipts. Existing amounts are not converted.
        </p>

        {error && (
          <p className="alert alert--danger" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="alert alert--success" role="status">
            Settings saved.
          </p>
        )}
        <div className="se-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {dirty && !saving && (
            <button type="button" className="btn btn--ghost" onClick={discard}>
              Discard changes
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
