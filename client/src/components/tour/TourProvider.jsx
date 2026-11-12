import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { TOUR_ROUTES } from "../../config/tourRoutes";
import { TOURS } from "../../config/tours";
import { clearSeenTours, listSeenTours, markTourSeen } from "../../data/tours";
import { TourContext } from "../../lib/tourContext";
import { matchTourKey, visibleSteps } from "../../lib/tourMatch";
import TourPopup from "./TourPopup";

export default function TourProvider({ children }) {
  const { user, can } = useAuth();
  const { pathname } = useLocation();
  const userId = user?.id ?? null;

  const [progress, setProgress] = useState({
    uid: null,
    keys: [],
    failed: false,
  });
  const [manualKey, setManualKey] = useState(null);
  const [readyKey, setReadyKey] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    listSeenTours(userId).then(({ keys, error }) => {
      if (!cancelled)
        setProgress({ uid: userId, keys, failed: Boolean(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Tour this page would open by itself (derived while rendering).
  const loaded = progress.uid === userId && !progress.failed;
  const routeKey = matchTourKey(pathname, TOUR_ROUTES);
  const autoKey =
    loaded &&
    routeKey &&
    TOURS[routeKey] &&
    !progress.keys.includes(routeKey) &&
    visibleSteps(TOURS[routeKey], can).length > 0
      ? routeKey
      : null;

  // Wait a moment after arriving, and never open on top of another dialog.
  useEffect(() => {
    if (!autoKey) return undefined;
    let timer;
    const attempt = () => {
      if (document.querySelector("dialog[open]")) {
        timer = setTimeout(attempt, 800);
        return;
      }
      setReadyKey(autoKey);
    };
    timer = setTimeout(attempt, 600);
    return () => clearTimeout(timer);
  }, [autoKey]);

  const activeKey =
    manualKey ?? (autoKey && readyKey === autoKey ? autoKey : null);
  const steps = activeKey ? visibleSteps(TOURS[activeKey], can) : [];

  const finish = useCallback(() => {
    const key = activeKey;
    setManualKey(null);
    if (!key || !userId || progress.keys.includes(key)) return;
    setProgress((p) => ({ ...p, keys: [...p.keys, key] }));
    markTourSeen(userId, key);
  }, [activeKey, userId, progress.keys]);

  const openTour = useCallback((key) => {
    if (TOURS[key]) setManualKey(key);
  }, []);

  const replayAll = useCallback(async () => {
    if (!userId) return { error: new Error("You are not signed in.") };
    const { error } = await clearSeenTours(userId);
    if (!error) setProgress((p) => ({ ...p, keys: [] }));
    return { error };
  }, [userId]);

  const value = useMemo(() => ({ openTour, replayAll }), [openTour, replayAll]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {activeKey && steps.length > 0 && (
        <TourPopup
          key={activeKey}
          tour={TOURS[activeKey]}
          steps={steps}
          onClose={finish}
        />
      )}
    </TourContext.Provider>
  );
}
