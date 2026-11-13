import { useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import MetricStrip from "./MetricStrip";
import Field from "../ui/Field";
import Pagination from "../ui/Pagination";
import {
  getCustomerRankings,
  getCustomerSnapshot,
  LAPSED_DAYS,
} from "../../data/analytics";
import { PAGE_SIZE } from "../../data/products";
import { monthLong, plural, useAnalyticsQuery } from "../../lib/analytics";
import { formatDate, formatMoney } from "../../lib/format";

const ANALYSES = [
  {
    key: "top_spending",
    label: "Top spending",
    note: "Who spent the most this month, after refunds.",
  },
  {
    key: "most_frequent",
    label: "Most frequent",
    note: "Who placed the most orders this month.",
  },
  {
    key: "lapsed",
    label: "Not bought lately",
    note: `Customers whose last purchase was more than ${LAPSED_DAYS} days ago, biggest lifetime spenders first.`,
  },
  {
    key: "new",
    label: "New customers",
    note: "Customers who joined this month.",
  },
];

function daysAgo(days) {
  if (days == null) return "Never";
  if (days === 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function Balance({ value, symbol }) {
  const v = Number(value);
  if (v > 0)
    return <span className="balance--owes">Owes {formatMoney(v, symbol)}</span>;
  if (v < 0)
    return (
      <span className="balance--credit">
        Credit {formatMoney(Math.abs(v), symbol)}
      </span>
    );
  return "—";
}

const note = (text) => <span className="an-change">{text}</span>;

export default function CustomerInsights({ businessId, from, to, symbol }) {
  const [key, setKey] = useState("top_spending");
  const current = ANALYSES.find((a) => a.key === key);

  // The page returns to 1 whenever the month or the analysis changes.
  const resetKey = JSON.stringify([from, to, key]);
  const [pageState, setPageState] = useState({ resetKey, page: 1 });
  if (pageState.resetKey !== resetKey) setPageState({ resetKey, page: 1 });
  const page = pageState.resetKey === resetKey ? pageState.page : 1;
  const setPage = (p) => setPageState({ resetKey, page: p });
  const offset = (page - 1) * PAGE_SIZE;

  const snapshot = useAnalyticsQuery(
    () => getCustomerSnapshot({ businessId, from, to }),
    [businessId, from, to],
  );
  const top = useAnalyticsQuery(
    () =>
      getCustomerRankings({
        businessId,
        from,
        to,
        rank: "top_spending",
        limit: 1,
        offset: 0,
      }),
    [businessId, from, to],
  );
  const topRow = top.data?.rows?.[0];

  const { data, loading, error, reload } = useAnalyticsQuery(
    () =>
      getCustomerRankings({
        businessId,
        from,
        to,
        rank: key,
        limit: PAGE_SIZE,
        offset,
      }),
    [businessId, from, to, key, page],
  );
  const rows = data?.rows ?? [];

  const s = snapshot.data;
  const stats = s
    ? [
        {
          key: "active",
          label: "Active customers",
          value: Number(s.total_active).toLocaleString(),
          change: note(
            `${plural(Number(s.buyers), "customer", "customers")} bought this month`,
          ),
        },
        {
          key: "new",
          label: "New this month",
          value: Number(s.new_in_period).toLocaleString(),
          change: note("Joined this month"),
        },
        {
          key: "returning",
          label: "Returning customers",
          value: s.returning_pct == null ? "—" : `${s.returning_pct}%`,
          change: note(
            `${s.returning_buyers} of ${plural(Number(s.buyers), "buyer", "buyers")}`,
          ),
        },
        {
          key: "owed",
          label: "Owed by customers",
          value: formatMoney(s.total_owed, symbol),
          change: note(
            Number(s.customers_owing) > 0
              ? plural(
                  Number(s.customers_owing),
                  "customer owes",
                  "customers owe",
                )
              : "Nobody owes you",
          ),
        },
      ]
    : [];

  return (
    <section
      className="card"
      aria-busy={loading}
      aria-labelledby="an-customers"
    >
      <div className="an-head">
        <div>
          <p className="an-eyebrow">Customer analytics</p>
          <h2 className="an-head__title" id="an-customers">
            Customer insights
          </h2>
          <p className="an-head__sub">
            Who buys, how often, and who has gone quiet.
          </p>
        </div>
        <Link className="an-card-link" to="/customers">
          View customers
        </Link>
      </div>

      {snapshot.error ? (
        <div className="alert alert--danger an-error-line" role="alert">
          Could not load the customer numbers: {snapshot.error}{" "}
          <button type="button" className="link-btn" onClick={snapshot.reload}>
            Try again
          </button>
        </div>
      ) : !s ? (
        <div className="an-metrics" aria-hidden="true">
          <span
            className="an-skeleton an-skeleton--value"
            style={{ width: "100%" }}
          />
        </div>
      ) : (
        <MetricStrip label="Customer numbers" items={stats} />
      )}

      {topRow && (
        <div className="an-callout an-subsection">
          <p className="an-callout__label">Top customer this month</p>
          <Link
            className="an-link an-callout__name"
            to={`/customers/${topRow.customer_id}`}
          >
            {topRow.customer_name}
          </Link>
          <p className="an-muted">
            {formatMoney(topRow.spent_in_period, symbol)} across{" "}
            {plural(Number(topRow.orders_in_period), "order", "orders")}
          </p>
        </div>
      )}

      <div className="an-toolbar">
        <Field
          as="select"
          label="Analysis"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        >
          {ANALYSES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </Field>
        <p className="an-toolbar__note">
          {key === "lapsed" ? (
            "Not limited to the selected month"
          ) : (
            <>
              Showing data for <strong>{monthLong(from)}</strong>
            </>
          )}
        </p>
      </div>
      <p className="an-muted">{current.note}</p>

      {error ? (
        <div className="alert alert--danger an-error-line" role="alert">
          Could not load this list: {error}{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <span
          className="an-skeleton an-skeleton--chart an-error-line"
          aria-hidden="true"
        />
      ) : rows.length === 0 ? (
        <div className="an-empty-state">
          <span className="an-empty-state__icon">
            <Users size={22} aria-hidden="true" />
          </span>
          <h3 className="card__title">No customers to show</h3>
          <p className="card__sub">
            There are no customers matching “{current.label}”
            {key === "lapsed" ? "." : ` for ${monthLong(from)}.`}
          </p>
        </div>
      ) : (
        <>
          <div className={`table-wrap ${loading ? "an-busy" : ""}`}>
            <table className="table table--stack">
              <thead>
                {key === "lapsed" ? (
                  <tr>
                    <th>Customer</th>
                    <th className="num">Lifetime spent</th>
                    <th>Last purchase</th>
                    <th>Balance</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Customer</th>
                    <th className="num">Orders</th>
                    <th className="num">Spent</th>
                    <th className="num">Lifetime spent</th>
                    <th>{key === "new" ? "Joined" : "Last purchase"}</th>
                    <th>Type</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer_id}>
                    <td className="cell-main">
                      <Link
                        className="an-link"
                        to={`/customers/${r.customer_id}`}
                      >
                        {r.customer_name}
                      </Link>
                      {r.phone && <p className="an-pline__sub">{r.phone}</p>}
                    </td>
                    {key === "lapsed" ? (
                      <>
                        <td className="num" data-label="Lifetime spent">
                          {formatMoney(r.lifetime_spent, symbol)}
                        </td>
                        <td data-label="Last purchase">
                          {r.last_purchase_at
                            ? `${formatDate(r.last_purchase_at)} · ${daysAgo(r.days_since_last)}`
                            : "Never"}
                        </td>
                        <td data-label="Balance">
                          <Balance value={r.balance} symbol={symbol} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num" data-label="Orders">
                          {Number(r.orders_in_period).toLocaleString()}
                        </td>
                        <td className="num" data-label="Spent">
                          {formatMoney(r.spent_in_period, symbol)}
                        </td>
                        <td className="num" data-label="Lifetime spent">
                          {formatMoney(r.lifetime_spent, symbol)}
                        </td>
                        <td
                          data-label={
                            key === "new" ? "Joined" : "Last purchase"
                          }
                        >
                          {key === "new"
                            ? formatDate(r.joined_at)
                            : r.last_purchase_at
                              ? `${formatDate(r.last_purchase_at)} · ${daysAgo(r.days_since_last)}`
                              : "Never"}
                        </td>
                        <td data-label="Type">
                          {r.is_new ? (
                            <span className="badge badge--success">New</span>
                          ) : r.is_returning ? (
                            <span className="badge">Returning</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
