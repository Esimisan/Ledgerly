import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import ProductThumb from "./ProductThumb";

export default function ImagePicker({
  url,
  hasImage,
  error,
  onPick,
  onRemove,
}) {
  const input = useRef(null);
  return (
    <div className="stack">
      <div className="image-picker">
        <ProductThumb url={url} large />
        <div className="image-picker__buttons">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => input.current.click()}
          >
            <ImagePlus size={16} aria-hidden="true" />{" "}
            {hasImage ? "Replace image" : "Add image"}
          </button>
          {hasImage && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onRemove}
            >
              <Trash2 size={16} aria-hidden="true" /> Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allows choosing the same file again
          if (file) onPick(file);
        }}
      />
      <p className="field__hint">
        JPG, PNG or WebP. Images are resized automatically.
      </p>
      {error && <p className="field__error">{error}</p>}
    </div>
  );
}
