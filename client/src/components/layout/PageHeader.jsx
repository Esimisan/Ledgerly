import { Bell, Menu } from "lucide-react";
import { useShell } from "../../context/ShellContext";
import MonthPicker from "./MonthPicker";
import UserMenu from "./UserMenu";

export default function PageHeader({ title, subtitle, period = false }) {
  const { openSidebar } = useShell();
  return (
    <header className="page-header">
      <div className="page-header__lead">
        <button
          type="button"
          className="icon-btn menu-btn"
          onClick={openSidebar}
          aria-label="Open menu"
          aria-controls="app-sidebar"
        >
          <Menu size={18} />
        </button>
        <div className="page-header__title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="page-header__actions">
        {period && <MonthPicker />}
        <button type="button" className="icon-btn" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
