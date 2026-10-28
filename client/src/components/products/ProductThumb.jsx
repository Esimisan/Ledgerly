import { useState } from "react";
import { Package } from "lucide-react";

export default function ProductThumb({ url, large = false }) {
  const [failedUrl, setFailedUrl] = useState(null); // an expired or broken URL falls back to the icon
  const showImage = url && url !== failedUrl;
  return (
    <span className={`thumb ${large ? "thumb--lg" : ""}`}>
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Package size={large ? 40 : 18} aria-hidden="true" />
      )}
    </span>
  );
}
