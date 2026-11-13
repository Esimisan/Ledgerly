import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getSalesSeries } from "../../data/analytics";
import {
  axisScale,
  bucketAxisLabel,
  bucketTitle,
  formatCompactMoney,
  monthLong,
  useAnalyticsQuery,
} from "../../lib/analytics";
import { formatMoney } from "../../lib/format";

function useWidth(ref) {
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const GRAN_LABEL = { day: "each day", week: "each week", month: "each month" };

export default function SalesChart({
  points,
  granularity,
  symbol,
  metricLabel = "Net sales",
  showOrders = true,
}) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  // The highlighted point is forgotten whenever `points` is a new array.
  const [activeState, setActiveState] = useState({ points, value: null });
  const active = activeState.points === points ? activeState.value : null;
  const setActive = (value) => setActiveState({ points, value });

  const small = width < 480;
  const height = small ? 220 : 280;
  const m = { top: 16, right: 14, bottom: 30, left: small ? 46 : 54 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const n = points.length;

  const { lo, hi, ticks } = useMemo(
    () => axisScale(points.map((p) => p.revenue)),
    [points],
  );
  const x = (i) => m.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v) => m.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  const line = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.revenue).toFixed(1)}`,
    )
    .join(" ");
  const area = n
    ? `${line} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
    : "";

  const maxLabels = Math.max(2, Math.floor(plotW / 62));
  const labelEvery = Math.ceil(n / maxLabels);

  function indexFromEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || n === 0) return null;
    const ratio = (e.clientX - rect.left) / rect.width;
    return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
  }

  function onKeyDown(e) {
    if (n === 0) return;
    const current = active ?? n - 1;
    let next = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, current + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  }

  const best = points.reduce(
    (a, p) => (p.revenue > (a?.revenue ?? -Infinity) ? p : a),
    null,
  );
  const ariaLabel = best
    ? `${metricLabel} chart. Highest: ${formatMoney(best.revenue, symbol)} on ${bucketTitle(best, granularity)}. Use the left and right arrow keys to inspect each point.`
    : `${metricLabel} chart`;
  const current = active !== null ? points[active] : null;

  return (
    <div className="an-chart-wrap" ref={wrapRef}>
      <svg
        className="chart chart--sales"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => active === null && n > 0 && setActive(n - 1)}
        onBlur={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              className="chart__grid"
              x1={m.left}
              x2={width - m.right}
              y1={y(t)}
              y2={y(t)}
            />
            <text
              className="chart__tick"
              x={m.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatCompactMoney(t, symbol)}
            </text>
          </g>
        ))}

        {n > 0 && <path className="chart__area" d={area} />}
        {n > 0 && <path className="chart__line" d={line} />}

        {points.map((p, i) => (
          <circle
            key={p.start}
            className="chart__dot"
            cx={x(i)}
            cy={y(p.revenue)}
            r={3}
          />
        ))}

        {current && (
          <g>
            <line
              className="chart__guide"
              x1={x(active)}
              x2={x(active)}
              y1={m.top}
              y2={m.top + plotH}
            />
            <circle
              className="chart__dot chart__dot--active"
              cx={x(active)}
              cy={y(current.revenue)}
              r={5}
            />
          </g>
        )}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.start}
              className="chart__tick"
              x={x(i)}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {bucketAxisLabel(p.start, granularity)}
            </text>
          ) : null,
        )}

        <rect
          className="chart__hit"
          x={m.left}
          y={m.top}
          width={plotW}
          height={plotH}
          onPointerMove={(e) => {
            const i = indexFromEvent(e);
            if (i !== null) setActive(i);
          }}
          onPointerDown={(e) => {
            const i = indexFromEvent(e);
            if (i !== null) setActive(i);
          }}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        />
      </svg>

      {current && (
        <div
          className="an-tooltip"
          role="status"
          style={{
            left: Math.min(width - 78, Math.max(78, x(active))),
            top: Math.max(8, y(current.revenue) - 10),
          }}
        >
          <span>{bucketTitle(current, granularity)}</span>
          <strong>{formatMoney(current.revenue, symbol)}</strong>
          {showOrders && (
            <span>
              {current.orders} {current.orders === 1 ? "order" : "orders"}
            </span>
          )}
        </div>
      )}

      <table className="an-sr-only">
        <caption>
          {metricLabel} for {GRAN_LABEL[granularity]}
        </caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>{metricLabel}</th>
            {showOrders && <th>Orders</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start}>
              <td>{bucketTitle(p, granularity)}</td>
              <td>{formatMoney(p.revenue, symbol)}</td>
              {showOrders && <td>{p.orders}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GRANS = [
  ["week", "Weekly"],
  ["month", "Monthly"],
  ["day", "Daily"],
];

const NOTES = {
  day: (from) => `Net sales (after refunds) for each day of ${monthLong(from)}`,
  week: (from) =>
    `Net sales (after refunds) for each week of ${monthLong(from)}`,
  month: () => "Net sales (after refunds) for the last 12 months",
};

export function SalesOverviewCard({ businessId, from, to, symbol }) {
  const { can } = useAuth();
  const [gran, setGran] = useState("day");

  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getSalesSeries({ businessId, from, to, granularity: gran }),
    [businessId, from, to, gran],
  );

  const points = useMemo(
    () =>
      (data ?? []).map((r) => ({
        start: r.bucket_start,
        end: r.bucket_end,
        revenue: Number(r.revenue),
        orders: Number(r.orders),
      })),
    [data],
  );
  const hasSales = points.some((p) => p.orders > 0 || p.revenue !== 0);

  return (
    <section className="card" aria-busy={loading}>
      <div className="an-card-head">
        <div>
          <h2 className="card__title">Sales Overview</h2>
          <p className="card__sub">
            Track how your sales are performing over time
          </p>
          <p className="an-muted">{NOTES[gran](from)}</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Chart period">
          {GRANS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={gran === key}
              onClick={() => setGran(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="alert alert--danger" role="alert">
          Could not load the chart: {error}{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <span className="an-skeleton an-skeleton--chart" aria-hidden="true" />
      ) : !hasSales ? (
        <div className="an-empty-chart">
          <h3 className="card__title">No sales in this period yet</h3>
          <p className="card__sub">
            Net sales will appear here as soon as you record one.
          </p>
          {can("sales.create") && (
            <Link to="/sales/new" className="btn btn--primary">
              Record a sale
            </Link>
          )}
        </div>
      ) : (
        <SalesChart points={points} granularity={gran} symbol={symbol} />
      )}
    </section>
  );
}
