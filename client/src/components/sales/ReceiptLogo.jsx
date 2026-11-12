import { useState } from "react";
import { useSignedUrl } from "../../hooks/useSettingsImages";

export default function ReceiptLogo({ path }) {
  const url = useSignedUrl("logos", path);
  const [failedUrl, setFailedUrl] = useState("");

  if (!path) return null;
  if (!url) {
    return (
      <div
        className="receipt__logo"
        data-logo-state="loading"
        aria-hidden="true"
      />
    );
  }
  if (failedUrl === url) return null;
  return (
    <div className="receipt__logo">
      <img src={url} alt="" onError={() => setFailedUrl(url)} />
    </div>
  );
}
