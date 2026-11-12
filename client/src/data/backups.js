import { supabase } from "../lib/supabase";

function friendly(error) {
  if (!error) return "";
  if (error.code === "57014" || /statement timeout/i.test(error.message || ""))
    return "The backup took too long to build. Please try again. If it keeps happening, contact support.";
  return error.message || "Could not create the backup. Please try again.";
}

// Returns the whole snapshot as JSON; the page saves it as a file.
export async function createBackup(businessId) {
  const { data, error } = await supabase.rpc("create_backup", {
    p_business_id: businessId,
  });
  return { data: error ? null : data, error: friendly(error) };
}

export async function listBackups(businessId) {
  const { data, error } = await supabase
    .from("backups")
    .select("id, created_at, created_by, size_bytes, status, row_counts")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { data: null, error: error.message };
  const ids = [
    ...new Set((data ?? []).map((b) => b.created_by).filter(Boolean)),
  ];
  let names = {};
  if (ids.length) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  }
  return {
    data: (data ?? []).map((b) => ({
      ...b,
      by: names[b.created_by] || "Unknown",
    })),
    error: "",
  };
}
