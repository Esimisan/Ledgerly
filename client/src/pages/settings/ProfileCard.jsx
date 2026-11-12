import { useState } from "react";
import Field from "../../components/ui/Field";
import ImagePicker from "../../components/settings/ImagePicker";
import { ReportState } from "../../components/reports/ReportParts";
import { useAuth } from "../../context/AuthContext";
import { getMyProfile, saveProfile } from "../../data/settings";
import { useImageDraft, useSignedUrl } from "../../hooks/useSettingsImages";
import { useRpcQuery } from "../../hooks/useRpcQuery";

function ProfileForm({ profile, email, userId, onSaved }) {
  const saved = {
    name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
  };
  const [form, setForm] = useState(saved);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const avatar = useImageDraft(256);
  const avatarUrl = useSignedUrl("avatars", profile?.avatar_path);

  const nameError = !form.name.trim() ? "Your name is required." : undefined;
  const dirty =
    form.name !== saved.name ||
    form.phone !== saved.phone ||
    Boolean(avatar.blob) ||
    avatar.removed;
  const shown = avatar.url || (avatar.removed ? "" : avatarUrl);
  const hasAvatar = Boolean(
    avatar.url || (!avatar.removed && profile?.avatar_path),
  );

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDone(false);
  };

  async function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    setDone(false);
    setError("");
    if (nameError) return;
    const clean = { name: form.name.trim(), phone: form.phone.trim() };
    setSaving(true);
    const res = await saveProfile({
      userId,
      fields: { full_name: clean.name, phone: clean.phone || null },
      newAvatar: avatar.blob ? { blob: avatar.blob, ext: avatar.ext } : null,
      removeAvatar: avatar.removed,
      previousPath: profile?.avatar_path ?? null,
    });
    if (res.error) {
      setSaving(false);
      setError(res.error);
      return;
    }
    await onSaved();
    setForm(clean);
    avatar.reset();
    setSaving(false);
    setShowErrors(false);
    setDone(true);
  }

  return (
    <form className="se-form" onSubmit={submit} noValidate>
      <ImagePicker
        label="Profile picture"
        shape="round"
        url={shown}
        fallback={(form.name.trim().charAt(0) || "?").toUpperCase()}
        hasImage={hasAvatar}
        onPick={avatar.pick}
        onRemove={avatar.remove}
        error={avatar.error}
        disabled={saving}
      />
      <div className="se-fields">
        <div className="se-grid">
          <Field
            label="Full name"
            value={form.name}
            onChange={set("name")}
            error={showErrors ? nameError : undefined}
            maxLength={120}
            autoComplete="name"
          />
          <Field
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            maxLength={40}
            autoComplete="tel"
          />
          <div className="se-span">
            <Field
              label="Email"
              value={email ?? ""}
              readOnly
              hint="Your sign-in email cannot be changed here."
            />
          </div>
        </div>
      </div>
      {error && (
        <p className="alert alert--danger" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="alert alert--success" role="status">
          Profile saved.
        </p>
      )}
      <div className="se-actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={saving || !dirty}
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

export default function ProfileCard() {
  const { user } = useAuth();
  const query = useRpcQuery(() => getMyProfile(user.id), [user.id]);
  return (
    <section className="card" aria-labelledby="se-profile">
      <h2 className="card__title" id="se-profile">
        Your profile
      </h2>
      <p className="card__sub">
        Your name and picture are shown to the people you work with.
      </p>
      <ReportState
        loading={query.loading && !query.data}
        error={query.data ? "" : query.error}
        onRetry={query.reload}
        lines={3}
      >
        <ProfileForm
          profile={query.data}
          email={user.email}
          userId={user.id}
          onSaved={query.reload}
        />
      </ReportState>
    </section>
  );
}
