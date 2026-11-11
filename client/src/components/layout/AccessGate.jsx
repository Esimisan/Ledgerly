import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageLoader } from "../ui/Loader";
import { useAuth } from "../../context/AuthContext";
import { getMyMembershipState } from "../../data/staff";
import { readPendingInvite } from "../../lib/invite";
import "../../styles/staff.css";

function SuspendedScreen({ businessName, onSignOut }) {
  return (
    <div className="st-gate">
      <section className="card st-gate__card" role="alert">
        <h1 className="card__title">Your access is suspended</h1>
        <p className="card__sub">
          Your access to {businessName} has been suspended, so you cannot open
          it right now. Please contact the business owner if you think this is a
          mistake.
        </p>
        <div className="st-actions st-gap">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AccessGate() {
  const { status, user, signOut } = useAuth();
  const location = useLocation();
  const userId = user?.id ?? null;
  const [state, setState] = useState({ uid: null, list: [] });

  useEffect(() => {
    if (status !== "needsBusiness" || !userId) return;
    let cancelled = false;
    getMyMembershipState().then(({ data }) => {
      if (!cancelled) setState({ uid: userId, list: data ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  if (status !== "needsBusiness" || location.pathname === "/accept-invite") {
    return <Outlet />;
  }
  if (state.uid !== userId) return <FullPageLoader />;

  const token = readPendingInvite();
  if (token) {
    return (
      <Navigate
        to={`/accept-invite?token=${encodeURIComponent(token)}`}
        replace
      />
    );
  }
  const suspended = state.list.find((m) => m.status === "suspended");
  if (suspended) {
    return (
      <SuspendedScreen
        businessName={suspended.business_name}
        onSignOut={signOut}
      />
    );
  }
  return <Outlet />;
}
