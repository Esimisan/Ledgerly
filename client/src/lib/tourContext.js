import { createContext, useContext } from "react";

export const TourContext = createContext(null);

// openTour(key) shows a tour now. replayAll() clears this user's "seen" state
// and resolves to { error }.
export function useTours() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTours must be used inside TourProvider");
  return ctx;
}
