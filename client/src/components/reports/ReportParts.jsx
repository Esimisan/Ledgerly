import { useEffect, useState } from "react";
import { Printer, Search } from "lucide-react";
import Pagination from "../ui/Pagination";
import { PAGE_SIZE } from "../../data/products";
import { useDebounced } from "../../hooks/useDebounced";
import "../../styles/reports.css";

export function Skeleton({ lines = 5 }) {
  return (
    <div className="rp-skel" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="rp-skel__line"
          style={{ width: `${100 - (i % 3) * 12}%` }}
        />
      ))}
    </div>
  );
}

// One place for loading / error (with "Try again") / designed empty state.
export function ReportState({
  loading,
  error,
  onRetry,
  empty,
  emptyTitle,
  emptyText,
  emptyAction,
  lines = 6,
  children,
}) {
  if (error) {
    return (
      <div className="alert alert--danger" role="alert">
        {error}{" "}
        {onRetry && (
          <button type="button" className="link-btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (loading) return <Skeleton lines={lines} />;
  if (empty) {
    return (
      <div className="empty">
        <h3 className="card__title">{emptyTitle}</h3>
        {emptyText && <p className="card__sub">{emptyText}</p>}
        {emptyAction && (
          <div
            className="kit-row"
            style={{ justifyContent: "center", marginTop: "var(--space-4)" }}
          >
            {emptyAction}
          </div>
        )}
      </div>
    );
  }
  return children;
}

export function ReportCard({ title, subtitle, actions, children }) {
  return (
    <section className="card rp-card">
      <header className="rp-head">
        <div>
          <h2 className="card__title">{title}</h2>
          {subtitle && <p className="card__sub">{subtitle}</p>}
        </div>
        {actions && <div className="rp-head__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// items: [{ label, value }]
export function Strip({ items }) {
  return (
    <div className="rp-strip">
      <dl className="rp-strip__grid">
        {items.map((i) => (
          <div className="rp-strip__item" key={i.label}>
            <dt>{i.label}</dt>
            <dd>{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FinanceNote() {
  return (
    <p className="info-note">
      Cost, profit and expense figures are shown to people with finance access
      only.
    </p>
  );
}

// Only visible when printing.
export function PrintHeader({ businessName, title, rangeText }) {
  const generated = new Date().toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <div className="rp-printhead">
      <strong>{businessName}</strong>
      <h2>{title}</h2>
      <p>{rangeText}</p>
      <p>Generated {generated} (Lagos time) · Ledgerly</p>
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn--secondary rp-noprint"
      onClick={() => window.print()}
    >
      <Printer size={16} aria-hidden="true" /> Print / Save as PDF
    </button>
  );
}

// Debounced search kept in the URL by the caller (value = the URL's q, onChange(q) updates it).
export function SearchBox({ value, onChange, label, placeholder }) {
  const [text, setText] = useState(value);
  // If the URL's value changes from outside (for example "Clear filters"), follow it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  const debounced = useDebounced(text, 300);
  useEffect(() => {
    if (debounced.trim() !== value) onChange(debounced.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <div className="toolbar__search rp-noprint">
      <Search size={16} aria-hidden="true" />
      <input
        className="input"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

export function PagerBar({ page, total, onPage }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="rp-noprint">
      <Pagination page={page} total={total} onPage={onPage} />
    </div>
  );
}
