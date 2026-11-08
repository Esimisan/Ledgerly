import { Link } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import { getCustomerSnapshot } from "../../data/analytics";
import { plural, useAnalyticsQuery } from "../../lib/analytics";
import { formatMoney } from "../../lib/format";

export default function CustomerStrip({
  businessId,
  from,
  to,
  symbol,
  detailed = false,
}) {
  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getCustomerSnapshot({ businessId, from, to }),
    [businessId, from, to],
  );

  if (error) {
    return (
      <section className="card">
        <div className="alert alert--danger" role="alert">
          Could not load the customer snapshot: {error}{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card" aria-busy="true" aria-hidden="true">
        <span
          className="an-skeleton an-skeleton--value"
          style={{ width: "100%" }}
        />
      </section>
    );
  }

  const owing = Number(data.customers_owing);

  return (
    <section className="card" aria-busy={loading}>
      <div className="an-strip">
        <div className="an-strip__who">
          <span className="an-strip__icon">
            <Users size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="an-strip__label">Customer snapshot</p>
            <p className="an-strip__value">
              {plural(Number(data.total_active), "customer", "customers")}
            </p>
          </div>
        </div>
        <div>
          <p className="an-strip__value">
            {Number(data.new_in_period).toLocaleString()}
          </p>
          <p className="an-strip__label">New this month</p>
        </div>
        <div>
          <p className="an-strip__value">
            {data.returning_pct == null ? "—" : `${data.returning_pct}%`}
          </p>
          <p className="an-strip__label">Returning customers</p>
        </div>
        <Link className="an-card-link" to="/customers">
          View customers <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {detailed && (
        <p className="an-strip__note">
          {owing > 0
            ? `${formatMoney(data.total_owed, symbol)} is owed by ${plural(owing, "customer", "customers")}.`
            : "No customer owes you money right now."}
        </p>
      )}
    </section>
  );
}
