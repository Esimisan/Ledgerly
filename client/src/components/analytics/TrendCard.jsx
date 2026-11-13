import { useState } from "react";
import InsightsPanel from "./InsightsCard";
import SalesChart from "./SalesChart";
import { getTrendSeries } from "../../data/analytics";
import { monthLong, useAnalyticsQuery } from "../../lib/analytics";

const METRICS = [
  { key: "revenue", label: "Revenue" },
  { key: "gross_profit", label: "Gross profit", finance: true },
  { key: "operating_expenses", label: "Operating expenses", finance: true },
  { key: "net_profit", label: "Net profit", finance: true },
];

const GRANS = [
  ["day", "Daily"],
  ["week", "Weekly"],
  ["month", "Monthly"],
];

const SUB = {
  day: (from) => `Daily movement for ${monthLong(from)}`,
  week: (from) => `Weekly movement for ${monthLong(from)}`,
  month: () => "Monthly movement over the last 12 months",
};

export default function TrendCard({ businessId, from, to, symbol, kpis }) {
  const [metric, setMetric] = useState("revenue");
  const [gran, setGran] = useState("day");
  const finance = kpis.data?.can_view_finance === true;
  const tabs = METRICS.filter((m) => !m.finance || finance);
  const current = tabs.find((m) => m.key === metric) ?? tabs[0];

  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getTrendSeries({ businessId, from, to, granularity: gran }),
    [businessId, from, to, gran],
  );

  const metricKey = current.key;
  const points = (data ?? []).map((r) => ({
    start: r.bucket_start,
    end: r.bucket_end,
    revenue: Number(r[metricKey] ?? 0),
    orders: Number(r.orders),
  }));
  const hasData = points.some(
    (p) => p.revenue !== 0 || (metricKey === "revenue" && p.orders > 0),
  );
  return (
    <section
      className="card an-trend-wrap"
      aria-busy={loading}
      aria-labelledby="an-trends"
    >
      <div className="an-trend">
        <div className="an-trend__main">
          <div className="an-head">
            <div>
              <p className="an-eyebrow" id="an-trends">
                {finance ? "Financial trends" : "Sales trends"}
              </p>
              <h2 className="an-head__title">Performance over time</h2>
              <p className="an-head__sub">{SUB[gran](from)}</p>
            </div>
            <div
              className="segmented"
              role="radiogroup"
              aria-label="Chart period"
            >
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

          {tabs.length > 1 && (
            <div className="an-utabs" role="tablist" aria-label="Metric">
              {tabs.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  className="an-utab"
                  aria-selected={current.key === m.key}
                  onClick={() => setMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <div className="an-trend-chart">
            {error ? (
              <div className="alert alert--danger" role="alert">
                Could not load the chart: {error}{" "}
                <button type="button" className="link-btn" onClick={reload}>
                  Try again
                </button>
              </div>
            ) : !data ? (
              <span
                className="an-skeleton an-skeleton--chart"
                aria-hidden="true"
              />
            ) : !hasData ? (
              <div className="an-empty-chart">
                <h3 className="card__title">Nothing to chart yet</h3>
                <p className="card__sub">
                  {current.label} will appear here once there is something
                  recorded in this period.
                </p>
              </div>
            ) : (
              <SalesChart
                points={points}
                granularity={gran}
                symbol={symbol}
                metricLabel={current.label}
                showOrders={current.key === "revenue"}
              />
            )}
          </div>
        </div>

        <div className="an-trend__side">
          <InsightsPanel
            data={kpis.data}
            loading={kpis.loading}
            error={kpis.error}
          />
        </div>
      </div>
    </section>
  );
}
