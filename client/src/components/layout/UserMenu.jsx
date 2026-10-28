import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ThemeSegmented } from "../ui/ThemeToggle";
import { capitalize, displayName, initials } from "../../lib/user";

export default function UserMenu() {
  const { user, role, business, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = displayName(user);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="user-chip"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="user-chip__text">
          <span className="user-chip__name">{name}</span>
          <span className="user-chip__role">{capitalize(role)}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className="menu" aria-label="Account menu">
          <div className="menu__head">
            <strong>{name}</strong>
            <span>{user.email}</span>
            <span>{business?.name}</span>
          </div>
          <hr className="menu__divider" />
          <p className="menu__label">Theme</p>
          <ThemeSegmented />
          <hr className="menu__divider" />
          <Link
            to="/settings"
            className="menu__item"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} aria-hidden="true" /> Settings
          </Link>
          <button type="button" className="menu__item" onClick={signOut}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
