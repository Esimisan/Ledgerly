export function friendlyAuthError(err) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("invalid login")) return "Incorrect email or password.";
  if (msg.includes("email not confirmed"))
    return "Please confirm your email first. Check your inbox for the link.";
  if (msg.includes("rate limit"))
    return "Too many attempts. Please wait a few minutes and try again.";
  if (msg.includes("already registered") || msg.includes("already exists"))
    return "An account with this email already exists. Try signing in.";
  return err?.message || "Something went wrong. Please try again.";
}
