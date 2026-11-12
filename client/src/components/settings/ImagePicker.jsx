import { useRef } from "react";

export default function ImagePicker({
  label,
  shape = "square",
  url,
  fallback,
  hasImage,
  onPick,
  onRemove,
  error,
  disabled,
}) {
  const input = useRef(null);
  return (
    <div className="se-media">
      <div
        className={`se-media__frame${shape === "round" ? " se-media__frame--round" : ""}`}
      >
        {url ? (
          <img className="se-media__img" src={url} alt="" />
        ) : (
          <span className="se-media__ph" aria-hidden="true">
            {fallback}
          </span>
        )}
      </div>
      <div className="se-media__body">
        <div className="se-media__label">{label}</div>
        <div className="se-media__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            {hasImage ? "Replace" : "Choose picture"}
          </button>
          {hasImage && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={disabled}
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPick(file);
          }}
        />
        <p className="se-hint">JPG, PNG or WebP. It is resized for you.</p>
        {error && (
          <p className="alert alert--danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
