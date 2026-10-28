import { useState } from "react";
import { Wallet } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Modal from "../../components/ui/Modal";

const TOKENS = [
  "bg",
  "bg-sidebar",
  "surface",
  "surface-2",
  "border",
  "text",
  "text-muted",
  "accent",
  "accent-soft",
  "success",
  "warning",
  "danger",
  "chart-1",
];

const POINTS = [10, 22, 18, 34, 28, 46, 40, 62, 55, 70];
const W = 300;
const H = 100;
const LINE = POINTS.map(
  (v, i) =>
    `${i === 0 ? "M" : "L"}${(i / (POINTS.length - 1)) * W},${H - (v / 80) * H}`,
).join(" ");

const ROWS = [
  { name: "Cotton T-shirt", units: 124, revenue: "₦1,860,000", pct: 100 },
  { name: "Canvas Tote", units: 86, revenue: "₦1,290,000", pct: 69 },
  { name: "Soya Candle", units: 41, revenue: "₦180,000", pct: 10 },
];

function KitSection({ label }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="kit-section">
      <h2 className="card__title">{label} theme</h2>

      <div className="swatches">
        {TOKENS.map((t) => (
          <span key={t} className="swatch">
            <i style={{ background: `var(--${t})` }} />
            {t}
          </span>
        ))}
      </div>

      <div className="kit-row">
        <button className="btn btn--primary">Primary</button>
        <button className="btn btn--secondary">Secondary</button>
        <button className="btn btn--ghost">Ghost</button>
        <button className="btn btn--primary" disabled>
          Disabled
        </button>
        <span className="badge">Badge</span>
        <span className="badge badge--success">Success</span>
        <span className="badge badge--warning">Warning</span>
        <span className="badge badge--danger">Danger</span>
      </div>

      <div className="card">
        <div className="stack">
          <Field label="Text input" placeholder="Placeholder text" />
          <Field
            label="Input with error"
            defaultValue="oops"
            error="This field has an error"
          />
          <Field as="select" label="Select">
            <option>Option one</option>
            <option>Option two</option>
          </Field>
          <div className="alert alert--danger">Danger alert</div>
          <div className="alert alert--success">Success alert</div>
        </div>
      </div>

      <div className="card">
        <div className="kpi__top">
          <span>Revenue</span>
          <span className="kpi__icon">
            <Wallet size={16} aria-hidden="true" />
          </span>
        </div>
        <p className="kpi__value">₦4,200,000</p>
        <p className="kpi__trend kpi__trend--up">
          +18% increase than last month
        </p>
        <p className="kpi__trend kpi__trend--down">
          -7% decrease vs last month
        </p>
      </div>

      <div className="card">
        <svg
          className="chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Sample sales chart"
        >
          {[25, 50, 75].map((y) => (
            <line key={y} className="chart__grid" x1="0" x2={W} y1={y} y2={y} />
          ))}
          <path className="chart__area" d={`${LINE} L${W},${H} L0,${H} Z`} />
          <path className="chart__line" d={LINE} />
        </svg>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Units</th>
              <th className="num">Revenue</th>
              <th>Performance</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{r.units}</td>
                <td className="num">{r.revenue}</td>
                <td>
                  <div className="progress">
                    <div className="progress__track">
                      <div
                        className="progress__bar"
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                    <span className="progress__value">{r.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kit-row">
        <button className="btn btn--secondary" onClick={() => setOpen(true)}>
          Open modal
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Example modal">
        <p>Modals, backdrops and dialogs follow the theme.</p>
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => setOpen(false)}>
            Confirm
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function DesignKit() {
  return (
    <>
      <PageHeader
        title="Design kit"
        subtitle="Dev only. Every component, in both themes at once."
      />
      <div className="kit-grid">
        {["light", "dark"].map((t) => (
          <div key={t} data-theme={t} className="theme-scope">
            <KitSection label={t} />
          </div>
        ))}
      </div>
    </>
  );
}
