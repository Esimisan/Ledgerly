import { Link } from "react-router-dom";
import {
  Archive,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getAttention } from "../../data/analytics";
import { useAnalyticsQuery } from "../../lib/analytics";
import { formatMoney, formatQty } from "../../lib/format";

function buildItem(row, { canEditProducts, symbol }) {
  const more = (n, one, many) =>
    n > 1 ? ` ${n - 1} more ${n - 1 === 1 ? one : many}.` : "";

  if (row.kind === "low_stock") {
    const qty = Number(row.quantity_on_hand);
    const out = qty <= 0;
    const min = Number(row.min_stock_level);
    return {
      key: row.kind,
      Icon: AlertTriangle,
      danger: out,
      kind: "Low stock",
      title: out
        ? `${row.product_name} is out of stock.`
        : `${row.product_name} has ${formatQty(qty)} ${qty === 1 ? "unit" : "units"} remaining.`,
      detail:
        (min > 0 ? `Minimum stock level: ${formatQty(min)} units.` : "") +
        more(
          Number(row.affected_count),
          "product needs restocking",
          "products need restocking",
        ),
      to: "/inventory?stock=low",
      linkText: "View inventory",
    };
  }

  if (row.kind === "declining_sales") {
    return {
      key: row.kind,
      Icon: TrendingDown,
      danger: true,
      kind: "Declining sales",
      title: `Sales of ${row.product_name} have declined by ${Math.abs(Number(row.change_pct))}%.`,
      detail:
        `Revenue went from ${formatMoney(row.previous_revenue, symbol)} to ${formatMoney(row.current_revenue, symbol)}.` +
        more(
          Number(row.affected_count),
          "product is declining",
          "products are declining",
        ),
      to: canEditProducts
        ? `/products/${row.product_id}/edit`
        : `/inventory?tab=movements&product=${row.product_id}`,
      linkText: "View product",
    };
  }

  const n = Number(row.affected_count);
  return {
    key: row.kind,
    Icon: Archive,
    danger: false,
    kind: "Unsold inventory",
    title: `${n} ${n === 1 ? "product has" : "products have"} not sold in the last 30 days.`,
    detail: "Review slow-moving stock before reordering.",
    to: "/products",
    linkText: "Review products",
  };
}

export default function AttentionCard({ businessId, from, to, symbol }) {
  const { can } = useAuth();
  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getAttention({ businessId, from, to }),
    [businessId, from, to],
  );
  const items = (data ?? []).map((row) =>
    buildItem(row, { canEditProducts: can("products.write"), symbol }),
  );

  return (
    <section className="card" aria-busy={loading}>
      <div className="an-card-head">
        <div>
          <h2 className="card__title">Needs attention</h2>
          <p className="card__sub">A few things worth looking at next.</p>
        </div>
        {data && items.length > 0 && (
          <span className="an-count">{items.length}</span>
        )}
      </div>

      {error ? (
        <div className="alert alert--danger" role="alert">
          Could not load this list: {error}{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div aria-hidden="true">
          <span
            className="an-skeleton an-skeleton--line"
            style={{ width: "40%" }}
          />
          <span
            className="an-skeleton an-skeleton--value"
            style={{ width: "90%" }}
          />
          <span
            className="an-skeleton an-skeleton--line"
            style={{ width: "60%" }}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="an-clear">
          <CheckCircle2 size={28} aria-hidden="true" />
          <h3 className="card__title">All clear</h3>
          <p className="card__sub">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <div className="an-attention">
          {items.map(
            ({ key, Icon, danger, kind, title, detail, to, linkText }) => (
              <div key={key} className="an-attention__item">
                <span
                  className={`an-attention__icon ${danger ? "an-attention__icon--danger" : ""}`}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="an-attention__kind">{kind}</p>
                  <p className="an-attention__title">{title}</p>
                  {detail && <p className="an-attention__detail">{detail}</p>}
                  <Link className="an-card-link" to={to}>
                    {linkText} <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
