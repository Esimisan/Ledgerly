import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ShellContext } from "../../context/ShellContext";
import { PeriodProvider } from "../../context/PeriodContext";
import Sidebar from "./Sidebar";

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer after navigating.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const shell = useMemo(
    () => ({
      sidebarOpen,
      openSidebar: () => setSidebarOpen(true),
      closeSidebar: () => setSidebarOpen(false),
    }),
    [sidebarOpen],
  );

  return (
    <ShellContext.Provider value={shell}>
      <PeriodProvider>
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
      </PeriodProvider>
    </ShellContext.Provider>
  );
}
