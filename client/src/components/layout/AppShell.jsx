import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ShellContext } from "../../context/ShellContext";
import { PeriodProvider } from "../../context/PeriodContext";
import Sidebar from "./Sidebar";
import TourProvider from "../tour/TourProvider";

export default function AppShell() {
  const { pathname } = useLocation();
  // The page the drawer was opened on. It counts as open only while you stay
  // on that page, so navigating closes it with no effect needed.
  const [openedAt, setOpenedAt] = useState(null);
  const sidebarOpen = openedAt === pathname;

  // Escape closes the drawer.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpenedAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const shell = useMemo(
    () => ({
      sidebarOpen,
      openSidebar: () => setOpenedAt(pathname),
      closeSidebar: () => setOpenedAt(null),
    }),
    [sidebarOpen, pathname],
  );

  return (
    <ShellContext.Provider value={shell}>
      <PeriodProvider>
        <TourProvider>
          <div className="shell">
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <Sidebar />
            <main id="main" className="main">
              <div className="main__inner">
                <Outlet />
              </div>
            </main>
          </div>
        </TourProvider>
      </PeriodProvider>
    </ShellContext.Provider>
  );
}
