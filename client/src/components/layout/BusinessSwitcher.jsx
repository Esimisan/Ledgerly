import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSwitchBusiness } from "../../hooks/useSwitchBusiness";
import { useSignedUrl } from "../../hooks/useSettingsImages";
import { ROLE_LABELS } from "../../config/permissions";
import "../../styles/switcher.css";

const ITEMS = '[role="menuitem"]:not([aria-disabled="true"])';

function initialsOf(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function BizAvatar({ name, logoPath }) {
  const url = useSignedUrl("logos", logoPath);
  return (
    <span className="bs__avatar" aria-hidden="true">
      {url ? <img src={url} alt="" /> : initialsOf(name)}
    </span>
  );
}

export default function BusinessSwitcher() {
  const { business, memberships } = useAuth();
  const switchTo = useSwitchBusiness();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const current = memberships.find((m) => m.businessId === business.id);
  const roleLabel = current ? (ROLE_LABELS[current.role] ?? current.role) : "";

  // Click or tap outside closes the menu. Fully reversible cleanup.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Opening moves focus to the current business.
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const target =
      menuRef.current.querySelector('[aria-current="true"]') ??
      menuRef.current.querySelector(ITEMS);
    target?.focus();
  }, [open]);

  function close(returnFocus) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onTriggerKey(e) {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setFailed(false);
      setOpen(true);
    }
  }

  function onMenuKey(e) {
    const items = [...menuRef.current.querySelectorAll(ITEMS)];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // do not also close the mobile drawer
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  async function pick(businessId) {
    setOpen(false);
    if (businessId === business.id) return;
    setFailed(false);
    const ok = await switchTo(businessId);
    if (!ok) setFailed(true); // on success the whole shell remounts
  }

  function addBusiness() {
    setOpen(false);
    navigate("/businesses/new");
  }

  return (
    <div className="bs" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="bs__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="business-menu"
        aria-label={`Switch business. Current business: ${business.name}`}
        onClick={() => {
          setFailed(false);
          setOpen((o) => !o);
        }}
        onKeyDown={onTriggerKey}
      >
        <BizAvatar name={business.name} logoPath={business.logo_path} />
        <span className="bs__text">
          <span className="bs__name">{business.name}</span>
          <span className="bs__sub">{roleLabel}</span>
        </span>
        <ChevronDown size={16} className="bs__chevron" aria-hidden="true" />
      </button>

      {failed && (
        <p className="alert alert--danger bs__error" role="alert">
          Could not open that business. Please try again.
        </p>
      )}

      {open && (
        <ul
          id="business-menu"
          className="bs__menu"
          role="menu"
          aria-label="Your businesses"
          ref={menuRef}
          onKeyDown={onMenuKey}
        >
          {memberships.map((m) => {
            const isCurrent = m.businessId === business.id;
            const suspended = m.status !== "active";
            const inner = (
              <>
                <BizAvatar name={m.name} logoPath={m.logoPath} />
                <span className="bs__text">
                  <span className="bs__name">{m.name}</span>
                  <span className="bs__sub">
                    {suspended
                      ? "Access suspended"
                      : (ROLE_LABELS[m.role] ?? m.role)}
                  </span>
                </span>
                {isCurrent && (
                  <Check size={16} className="bs__check" aria-hidden="true" />
                )}
              </>
            );
            return (
              <li key={m.businessId} role="none">
                {suspended ? (
                  <div
                    role="menuitem"
                    aria-disabled="true"
                    className="bs__item"
                  >
                    {inner}
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className="bs__item"
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => pick(m.businessId)}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
          <li role="separator" className="bs__sep" />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="bs__item"
              onClick={addBusiness}
            >
              <span className="bs__avatar" aria-hidden="true">
                <Plus size={16} />
              </span>
              <span className="bs__text">
                <span className="bs__name">Add another business</span>
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
