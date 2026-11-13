import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "./landingData";
import { scrollToSection } from "./scrollToSection";

export default function MarketingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (id) => (e) => {
    e.preventDefault();
    setOpen(false);
    scrollToSection(id);
  };

  return (
    <header className="lp-nav">
      <div className="lp-nav__bar lp-container">
        <Link to="/" className="lp-brand">
          <img src="/favicon-96x96.png" width="32" height="32" alt="" />
          <span className="lp-brand__name">LEDGERLY</span>
        </Link>

        <nav className="lp-nav__links" aria-label="Main">
          {NAV_LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="lp-nav__actions">
          <Link to="/login" className="lp-btn lp-btn--ghost lp-nav__login">
            Login
          </Link>
          <Link to="/signup" className="lp-btn lp-btn--primary">
            Get started
          </Link>
          <button
            type="button"
            className="lp-nav__toggle"
            aria-expanded={open}
            aria-controls="lp-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div id="lp-menu" className="lp-menu">
          <div className="lp-container">
            {NAV_LINKS.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>
                {l.label}
              </a>
            ))}
            <Link to="/login">Login</Link>
          </div>
        </div>
      )}
    </header>
  );
}
