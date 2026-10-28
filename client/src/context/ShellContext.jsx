import { createContext, useContext } from "react";

export const ShellContext = createContext({
  sidebarOpen: false,
  openSidebar() {},
  closeSidebar() {},
});

export const useShell = () => useContext(ShellContext);
