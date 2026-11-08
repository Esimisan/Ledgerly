import { useEffect } from "react";
import {
  Calculator,
  Coins,
  Package,
  Percent,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import ChangeText from "./ChangeText";
import { getKpis } from "../../data/analytics";
import { compareLabel, useAnalyticsQuery } from "../../lib/analytics";
import { formatMoney, formatQty } from "../../lib/format";

const CARDS = {
  revenue: { label: "Revenue", icon: Wallet, money: true },
  gross_profit: { label: "Gross profit", icon: Coins, money: true },
  gross_margin_pct: {
    label: "Gross margin",
    icon: Percent,
    pct: true,
    field: "change_points",
    unit: "pts",
  },
  operating_expenses: {
    label: "Operating expenses",
    icon: Receipt,
    money: true,
    inverse: true,
  },
  net_profit: { label: "Net profit", icon: TrendingUp, money: true },
  orders: { label: "Orders", icon: ShoppingBag },
  avg_order_value: {
    label: "Average order value",
    icon: Calculator,
    money: true,
  },
  units_sold: { label: "Products sold", icon: Package, units: true },
};

const LAYOUTS = {
  overview: {
    finance: ["revenue", "operating_expenses", "net_profit", "orders"],
    basic: ["revenue", "orders", "avg_order_value", "units_sold"],
  },
  today: {
    finance: [
      "revenue",
      "operating_expenses",
      "net_profit",
      "orders",
      "units_sold",
    ],
    basic: ["revenue", "orders", "units_sold"],
  },
  month: {
    finance: [
      "revenue",
      "gross_profit",
      "gross_margin_pct",
      "operating_expenses",
      "net_profit",
      "orders",
      "avg_order_value",
      "units_sold",
    ],
    basic: ["revenue", "orders", "avg_order_value", "units_sold"],
  },
};

function show(def, metric, symbol) {
  const v = metric?.current;
  if (v == null) return "—";
  if (def.money) return formatMoney(v, symbol);
  if (def.pct) return `${v}%`;
  if (def.units) return formatQty(v);
  return Number(v).toLocaleString();
}

export default function KpiGrid({
  businessId,
  symbol,
  from,
  to,
  variant = "overview",
  mode = "month",
  onLoaded,
}) {
  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getKpis({ businessId, from, to }),
    [businessId, from, to],
  );

  useEffect(() => {
    if (data && onLoaded) onLoaded(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error) {
    return (
      <div className="alert alert--danger" role="alert">
        Could not load the numbers: {error}{" "}
        <button type="button" className="link-btn" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid-kpi" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <section key={i} className="card an-kpi" aria-hidden="true">
            <span
              className="an-skeleton an-skeleton--line"
              style={{ width: "45%" }}
            />
            <span className="an-skeleton an-skeleton--value" />
            <span
              className="an-skeleton an-skeleton--line"
              style={{ width: "70%" }}
            />
          </section>
        ))}
      </div>
    );
  }

  const keys = LAYOUTS[variant][data.can_view_finance ? "finance" : "basic"];
  const label = compareLabel({ mode, isPartial: data.is_partial });

  return (
    <div className={`grid-kpi ${loading ? "an-busy" : ""}`} aria-busy={loading}>
      {keys.map((key) => {
        const def = CARDS[key];
        const metric = data.kpis[key];
        const Icon = def.icon;
        return (
          <section key={key} className="card an-kpi">
            <div className="kpi__top">
              <span>{def.label}</span>
              <span className="kpi__icon">
                <Icon size={16} aria-hidden="true" />
              </span>
            </div>
            <p className="kpi__value">{show(def, metric, symbol)}</p>
            <p className="kpi__trend">
              <ChangeText
                metric={metric}
                label={label}
                inverse={def.inverse}
                field={def.field}
                unit={def.unit}
              />
            </p>
          </section>
        );
      })}
    </div>
  );
}
