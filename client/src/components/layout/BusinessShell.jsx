import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FullPageLoader } from "../ui/Loader";
import AppShell from "./AppShell";

export default function BusinessShell() {
  const { business, switching } = useAuth();
  const navigate = useNavigate();
  const businessId = business?.id ?? null;
  const previousId = useRef(businessId);

  // Safety net: if the active business changes by any route, never stay on a URL
  // that may hold an id from the other business. Idempotent, so Strict Mode is safe.
  useEffect(() => {
    if (previousId.current !== businessId) {
      previousId.current = businessId;
      navigate("/", { replace: true });
    }
  }, [businessId, navigate]);

  // While a switch loads, NO page is rendered.
  if (switching) return <FullPageLoader />;
  return <AppShell key={businessId} />;
}
