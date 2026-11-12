import { supabase } from "../lib/supabase";
import { deleteImage, uploadImage } from "../lib/settingsImages";

function readable(error, fallback) {
  if (!error) return "";
  if (error.code === "42501" || /row-level security/i.test(error.message || ""))
    return "You do not have permission to do that.";
  return error.message || fallback;
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, avatar_path")
    .eq("id", userId)
    .maybeSingle();
  return {
    data: error ? null : data,
    error: readable(error, "Could not load your profile."),
  };
}

export async function saveBusinessSettings({
  businessId,
  fields,
  newLogo,
  removeLogo,
  previousPath,
}) {
  let uploaded = null;
  try {
    if (newLogo)
      uploaded = await uploadImage(
        "logos",
        businessId,
        newLogo.blob,
        newLogo.ext,
      );
    const logo_path = newLogo
      ? uploaded
      : removeLogo
        ? null
        : (previousPath ?? null);
    const { data, error } = await supabase
      .from("businesses")
      .update({ ...fields, logo_path })
      .eq("id", businessId)
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new Error(
        "You do not have permission to change the business settings.",
      );
    if (previousPath && previousPath !== logo_path)
      await deleteImage("logos", previousPath);
    return { error: "" };
  } catch (err) {
    if (uploaded) await deleteImage("logos", uploaded);
    return {
      error: readable(err, "Could not save the settings. Please try again."),
    };
  }
}

export async function saveProfile({
  userId,
  fields,
  newAvatar,
  removeAvatar,
  previousPath,
}) {
  let uploaded = null;
  try {
    if (newAvatar)
      uploaded = await uploadImage(
        "avatars",
        userId,
        newAvatar.blob,
        newAvatar.ext,
      );
    const avatar_path = newAvatar
      ? uploaded
      : removeAvatar
        ? null
        : (previousPath ?? null);
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...fields, avatar_path })
      .eq("id", userId)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Could not save your profile.");
    // keep the name in the sign-in session too, so the header shows it
    await supabase.auth.updateUser({ data: { full_name: fields.full_name } });
    if (previousPath && previousPath !== avatar_path)
      await deleteImage("avatars", previousPath);
    return { error: "" };
  } catch (err) {
    if (uploaded) await deleteImage("avatars", uploaded);
    return {
      error: readable(err, "Could not save your profile. Please try again."),
    };
  }
}

// Checks the current password first, then sets the new one.
export async function changePassword({ email, current, next }) {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: current,
  });
  if (signInError) {
    return {
      error: /invalid login credentials/i.test(signInError.message)
        ? "Your current password is not correct."
        : signInError.message,
    };
  }
  const { error } = await supabase.auth.updateUser({ password: next });
  return { error: error ? error.message : "" };
}
