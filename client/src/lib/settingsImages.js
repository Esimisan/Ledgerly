import { supabase } from "./supabase";

export const MAX_IMAGE_BYTES = 1048576; // the logos and avatars buckets allow 1 MB
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Shrinks a picture to at most maxSide pixels. Returns { blob, ext } or { error }.
export async function prepareImage(file, maxSide = 512) {
  if (!file) return { error: "Choose a picture first." };
  if (!OK_TYPES.includes(file.type))
    return { error: "Use a JPG, PNG or WebP picture." };
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: "That picture could not be read. Try another one." };
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob)
    return { error: "That picture could not be prepared. Try another one." };
  if (blob.size > MAX_IMAGE_BYTES)
    return { error: "That picture is still too large. Try a smaller one." };
  return { blob, ext: "webp" };
}

// folder is the business id (logos) or the user id (avatars), as the Storage policies expect.
export async function uploadImage(bucket, folder, blob, ext) {
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: blob.type || "image/webp",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function deleteImage(bucket, path) {
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    /* best effort: a leftover file is harmless */
  }
}

export async function signedImageUrl(bucket, path) {
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
}
