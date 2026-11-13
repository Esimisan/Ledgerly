import { useMemo } from "react";
import MetricStrip from "./MetricStrip";
import { buildMetrics } from "../../lib/buildMetrics";
import { getKpis } from "../../data/analytics";
import {
  refreshedText,
  todayRange,
  useAnalyticsQuery,
} from "../../lib/analytics";

const FINANCE_KEYS = [
  "revenue",
  "operating_expenses",
  "net_profit",
  "orders",
  "units_sold",
];
const BASIC_KEYS = ["revenue", "orders", "units_sold"];

export default function TodayCard({ businessId, symbol }) {
  const today = useMemo(() => todayRange(), []);
  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getKpis({ businessId, from: today.from, to: today.to }),
    [businessId, today.from, today.to],
  );

  return (
    <section className="card" aria-busy={loading} aria-labelledby="an-today">
      <div className="an-head">
        <p className="an-eyebrow" id="an-today">
          Today’s performance
        </p>
        {data && (
          <span className="an-live">
            Updated {refreshedText(data.refreshed_at)}
          </span>
        )}
      </div>

      {error ? (
        <div className="alert alert--danger an-error-line" role="alert">
          Could not load today’s numbers: {error}{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div className="an-metrics" aria-hidden="true">
          <span
            className="an-skeleton an-skeleton--line"
            style={{ width: "40%" }}
          />
          <span className="an-skeleton an-skeleton--value" />
          <span
            className="an-skeleton an-skeleton--line"
            style={{ width: "55%" }}
          />
        </div>
      ) : (
        <MetricStrip
          label="Today’s performance"
          items={buildMetrics(
            data,
            data.can_view_finance ? FINANCE_KEYS : BASIC_KEYS,
            symbol,
            "than yesterday",
          )}
        />
      )}
    </section>
  );
}
