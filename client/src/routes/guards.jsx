import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FullPageLoader } from "../components/ui/Loader";
import { NoAccess } from "../pages/Status";

// Login/signup: signed-in users are sent onward (back to where they came from if known).
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageLoader />;
  if (status === "signedOut") return <Outlet />;
  if (status === "needsBusiness") return <Navigate to="/onboarding" replace />;
  return <Navigate to={location.state?.from?.pathname ?? "/"} replace />;
}

// Needs a signed-in user, nothing more (used by /onboarding).
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageLoader />;
  if (status === "signedOut")
    return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Needs a signed-in user who belongs to a business.
export function RequireBusiness() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageLoader />;
  if (status === "signedOut")
    return <Navigate to="/login" replace state={{ from: location }} />;
  if (status === "needsBusiness") return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

// UI convenience only. The real enforcement is RLS in the database.
export function RequirePermission({ permission }) {
  const { can } = useAuth();
  return can(permission) ? <Outlet /> : <NoAccess />;
}
