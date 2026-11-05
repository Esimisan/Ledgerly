import { supabase } from "./supabase";

const BUCKET = "expense-receipts";
const TTL_SECONDS = 3600;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const RECEIPT_ACCEPT = [...IMAGE_TYPES, "application/pdf"].join(",");

const MAX_INPUT_BYTES = 15 * 1024 * 1024; // what a phone camera may give us
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // matches the bucket limit
const MAX_EDGE = 1600; // bigger than product photos so small print stays readable

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Returns { blob, ext, kind: "image" | "pdf", name }.
// PDFs go through unchanged; images are resized and re-encoded.
export async function prepareReceipt(file) {
  if (file.type === "application/pdf") {
    if (file.size > MAX_OUTPUT_BYTES)
      throw new Error("That PDF is too large. Choose one under 5 MB.");
    const head = await file.slice(0, 5).text();
    if (head !== "%PDF-")
      throw new Error("That file does not look like a valid PDF.");
    return { blob: file, ext: "pdf", kind: "pdf", name: file.name };
  }

  if (!IMAGE_TYPES.includes(file.type))
    throw new Error("Please choose a JPG, PNG, WebP or PDF file.");
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

  let blob = await toBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    // No WebP support: JPEG has no transparency, so paint a white backdrop first.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    blob = await toBlob(canvas, "image/jpeg", 0.88);
  }
  if (!blob)
    throw new Error("That image could not be processed. Try a different file.");
  if (blob.size > MAX_OUTPUT_BYTES)
    throw new Error("That image is still too large after resizing.");

  return {
    blob,
    ext: blob.type === "image/webp" ? "webp" : "jpg",
    kind: "image",
    name: file.name,
  };
}

// Path = <business id>/<random id>.<ext>. The first folder is the business, which is
// what the storage policies and the expenses_receipt_path_owner check both rely on.
export async function uploadReceipt(businessId, blob, ext) {
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function deleteReceipt(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

// A fresh short-lived link, made only when someone clicks "View receipt".
export async function getReceiptUrl(path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TTL_SECONDS);
  if (error || !data?.signedUrl)
    return {
      url: "",
      error: error?.message || "Could not open the receipt.",
    };
  return { url: data.signedUrl, error: "" };
}
