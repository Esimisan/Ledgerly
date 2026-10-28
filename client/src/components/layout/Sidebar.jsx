import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useShell } from "../../context/ShellContext";
import { MAIN_NAV, SETTINGS_NAV } from "../../config/nav";

function NavItem({ item }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const children = (item.children ?? []).filter(
    (c) => !c.permission || can(c.permission),
  );
  const expanded = children.length > 0 && pathname.startsWith(item.to);
  const Icon = item.icon;

  return (
    <li>
      {/* `end` so a parent isn't highlighted while one of its children is the active page */}
      <NavLink
        to={item.to}
        end={item.to === "/" || children.length > 0}
        className="nav__link"
      >
        <Icon size={18} aria-hidden="true" />
        <span>{item.label}</span>
        {children.length > 0 && (
          <ChevronDown size={14} className="nav__chevron" aria-hidden="true" />
        )}
      </NavLink>
      {expanded && (
        <ul className="nav__sub">
          {children.map((c) => (
            <li key={c.to}>
              <NavLink to={c.to} className="nav__link">
                {c.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Sidebar() {
  const { can } = useAuth();
  const { sidebarOpen, closeSidebar } = useShell();
  const visible = MAIN_NAV.filter((i) => !i.permission || can(i.permission));

  return (
    <>
      <div
        className={`backdrop ${sidebarOpen ? "is-visible" : ""}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />
      <aside
        id="app-sidebar"
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar__top">
          <span className="wordmark">LEDGERLY</span>
          <button
            type="button"
            className="icon-btn sidebar__close"
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <p className="sidebar__label">WORKSPACE</p>
        <nav aria-label="Workspace">
          <ul className="nav">
            {visible.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </ul>
        </nav>

        <div className="sidebar__footer">
          <ul className="nav">
            <NavItem item={SETTINGS_NAV} />
            {import.meta.env.DEV && (
              <li>
                <NavLink to="/design-kit" className="nav__link">
                  <span>Design kit (dev)</span>
                </NavLink>
              </li>
            )}

            {import.meta.env.DEV && (
              <li>
                <NavLink to="/theme-compare" className="nav__link">
                  <span>Theme compare (dev)</span>
                </NavLink>
              </li>
            )}
          </ul>
        </div>
      </aside>
    </>
  );
}
