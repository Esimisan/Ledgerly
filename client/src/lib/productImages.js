import { supabase } from "./supabase";

const BUCKET = "product-images";
const TTL_SECONDS = 3600;
const cache = new Map(); // path -> { url, expires }

export async function uploadProductImage(businessId, blob, ext) {
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: blob.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function deleteProductImage(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

// One request signs every missing path; signed URLs are reused until ~10 minutes before expiry.
export async function signedUrlMap(paths) {
  const now = Date.now();
  const wanted = [...new Set(paths.filter(Boolean))];
  const missing = wanted.filter((p) => !(cache.get(p)?.expires > now));

  if (missing.length) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(missing, TTL_SECONDS);
    for (const item of data ?? []) {
      if (item.signedUrl) {
        cache.set(item.path, {
          url: item.signedUrl,
          expires: now + (TTL_SECONDS - 600) * 1000,
        });
      }
    }
  }
  return Object.fromEntries(
    wanted.filter((p) => cache.has(p)).map((p) => [p, cache.get(p).url]),
  );
}
