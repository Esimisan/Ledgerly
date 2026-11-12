import { supabase } from "../lib/supabase";

// Tours this user has already seen or skipped.
export async function listSeenTours(userId) {
  const { data, error } = await supabase
    .from("tour_progress")
    .select("tour_key")
    .eq("user_id", userId);
  return { keys: (data ?? []).map((r) => r.tour_key), error };
}

// Insert-only (no update grant): ignoring duplicates keeps it safe to repeat.
export async function markTourSeen(userId, tourKey) {
  const { error } = await supabase
    .from("tour_progress")
    .upsert(
      { user_id: userId, tour_key: tourKey },
      { onConflict: "user_id,tour_key", ignoreDuplicates: true },
    );
  return { error };
}

// "Replay all": RLS limits this to the caller's own rows.
export async function clearSeenTours(userId) {
  const { error } = await supabase
    .from("tour_progress")
    .delete()
    .eq("user_id", userId);
  return { error };
}
