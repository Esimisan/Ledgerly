import { lazy, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FullPageLoader } from "../components/ui/Loader";

const LandingPage = lazy(() => import("../pages/marketing/LandingPage"));

// Signed-out visitors at exactly "/" see the public landing page. Everything else (and every signed-in user) goes through the normal guards.
export default function RootGate() {
  const { status } = useAuth();
  const { pathname } = useLocation();

  if (pathname === "/" && status === "signedOut") {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <LandingPage />
      </Suspense>
    );
  }
  return <Outlet />;
}
