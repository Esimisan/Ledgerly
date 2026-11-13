import ChangeText from "./ChangeText";
import MetricStrip from "./MetricStrip";
import { buildMetrics } from "../../lib/buildMetrics";
import { compareRangeText, monthLong, plural } from "../../lib/analytics";
import { formatMoney } from "../../lib/format";

const FINANCE_KEYS = [
  "gross_profit",
  "gross_margin_pct",
  "operating_expenses",
  "net_profit",
];
const OPERATIONAL_KEYS = ["orders", "avg_order_value", "units_sold"];

export default function FinancialOverview({ kpis, symbol, from }) {
  const { data, loading, error, reload } = kpis;
  const finance = data?.can_view_finance === true;

  return (
    <section
      className="card"
      aria-busy={loading}
      aria-labelledby="an-financial"
    >
      <div className="an-head">
        <div>
          <p className="an-eyebrow" id="an-financial">
            {finance ? "Financial overview" : "Sales overview"}
          </p>
          <h2 className="an-head__title">{monthLong(from)}</h2>
        </div>
        {data && (
          <p className="an-head__note">
            Compared with {compareRangeText(data.compare)}
            {data.is_partial ? " · same days last month" : ""}
          </p>
        )}
      </div>

      {error ? (
        <div className="alert alert--danger an-error-line" role="alert">
          Could not load the overview: {error}{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div className="an-hero" aria-hidden="true">
          <span
            className="an-skeleton an-skeleton--line"
            style={{ width: "30%" }}
          />
          <span
            className="an-skeleton an-skeleton--value"
            style={{ width: "45%" }}
          />
          <span
            className="an-skeleton an-skeleton--line"
            style={{ width: "40%" }}
          />
        </div>
      ) : (
        <>
          <div className="an-hero">
            <p className="an-hero__label">Total revenue</p>
            <p className="an-hero__value">
              {formatMoney(data.kpis.revenue.current, symbol)}
            </p>
            <div className="an-hero__meta">
              <ChangeText metric={data.kpis.revenue} words />
              <span>
                {plural(
                  Number(data.kpis.orders.current),
                  "completed order",
                  "completed orders",
                )}
              </span>
            </div>
          </div>

          {finance && (
            <MetricStrip
              roomy
              label="Profit and spending"
              items={buildMetrics(data, FINANCE_KEYS, symbol)}
            />
          )}

          <div className="an-subsection">
            <p className="an-eyebrow">Operational performance</p>
            <MetricStrip
              label="Operational performance"
              items={buildMetrics(data, OPERATIONAL_KEYS, symbol)}
            />
          </div>
        </>
      )}
    </section>
  );
}
