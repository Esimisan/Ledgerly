import { useRef, useState } from "react";
import dashboard from "../../assets/landing/dashboard.webp";
import sales from "../../assets/landing/sales.webp";
import analytics from "../../assets/landing/analytics.webp";
import reports from "../../assets/landing/reports.webp";

const TABS = [
  {
    id: "dashboard",
    label: "Dashboard",
    src: dashboard,
    w: 1400,
    h: 658,
    title: "Your business at a glance",
    text: "Revenue, expenses, net profit and orders for the period you choose, with a sales chart you can switch between daily, weekly and monthly.",
    alt: "Ledgerly dashboard showing revenue, operating expenses, net profit, orders and a daily sales chart",
  },
  {
    id: "sales",
    label: "Sales",
    src: sales,
    w: 1400,
    h: 681,
    title: "Every sale, with its payments and returns",
    text: "Search sales, filter by status, customer or date, see money still owed and export the list as CSV.",
    alt: "Ledgerly sales list with search, filters and a table of sales and their payment status",
  },
  {
    id: "analytics",
    label: "Analytics",
    src: analytics,
    w: 1400,
    h: 553,
    title: "Understand how the business is performing",
    text: "Revenue, gross profit, margin, operating expenses and net profit, compared with the same days last month.",
    alt: "Ledgerly financial overview showing revenue, gross profit, margin, expenses and net profit",
  },
  {
    id: "reports",
    label: "Reports",
    src: reports,
    w: 1400,
    h: 804,
    title: "Reports you can export",
    text: "Pick a date range and a report, then export it as CSV or print it to PDF.",
    alt: "Ledgerly sales summary report with export and print buttons and a daily sales chart",
  },
];

export default function Showcase() {
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  const tab = TABS[active];

  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : TABS.length - 1;
    const next = (active + step) % TABS.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="lp-showcase">
      <div
        className="lp-tabs"
        role="tablist"
        aria-label="Product screens"
        onKeyDown={onKeyDown}
      >
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={i === active}
            aria-controls="lp-panel"
            tabIndex={i === active ? 0 : -1}
            className="lp-tab"
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="lp-panel" role="tabpanel" aria-labelledby={`tab-${tab.id}`}>
        <div className="lp-showcase__copy">
          <h3>{tab.title}</h3>
          <p>{tab.text}</p>
        </div>
        <figure className="lp-frame">
          <img
            src={tab.src}
            width={tab.w}
            height={tab.h}
            alt={tab.alt}
            loading="lazy"
            decoding="async"
          />
        </figure>
        <p className="lp-note">Screens show sample data.</p>
      </div>
    </div>
  );
}
