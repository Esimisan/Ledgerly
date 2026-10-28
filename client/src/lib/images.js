const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // matches the bucket limit
const MAX_EDGE = 800;

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Returns { blob, ext }: the longest side is at most 800px, encoded as WebP (JPEG if unsupported).
export async function prepareImage(file) {
  if (!ACCEPTED.includes(file.type))
    throw new Error("Please choose a JPG, PNG or WebP image.");
  if (file.size > MAX_INPUT_BYTES)
    throw new Error("That image is too large. Choose one under 15 MB.");

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); // honours phone rotation
  } catch {
    throw new Error("That image could not be read. Try a different file.");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await toBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") {
    // Some browsers cannot encode WebP. JPEG has no transparency, so paint a white backdrop first.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    blob = await toBlob(canvas, "image/jpeg", 0.85);
  }
  if (!blob)
    throw new Error("That image could not be processed. Try a different file.");
  if (blob.size > MAX_OUTPUT_BYTES)
    throw new Error("That image is still too large after resizing.");

  return { blob, ext: blob.type === "image/webp" ? "webp" : "jpg" };
}
