import ChangeText from "./ChangeText";
import { formatMoney, formatQty } from "../../lib/format";

const DEFS = {
  revenue: { label: "Revenue", money: true },
  gross_profit: { label: "Gross profit", money: true },
  gross_margin_pct: {
    label: "Gross margin",
    pct: true,
    field: "change_points",
    unit: "pts",
  },
  operating_expenses: {
    label: "Operating expenses",
    money: true,
    inverse: true,
  },
  net_profit: { label: "Net profit", money: true },
  orders: { label: "Orders" },
  avg_order_value: { label: "Average order value", money: true },
  units_sold: { label: "Products sold", units: true },
};

function show(def, metric, symbol) {
  const v = metric?.current;
  if (v == null) return "—";
  if (def.money) return formatMoney(v, symbol);
  if (def.pct) return `${v}%`;
  if (def.units) return formatQty(v);
  return Number(v).toLocaleString();
}

// `compare` is the text after the % (for example "than yesterday"), or "" when the section
// header already says what the comparison is against.
export function buildMetrics(data, keys, symbol, compare = "") {
  return keys.map((key) => {
    const def = DEFS[key];
    const metric = data.kpis[key];
    return {
      key,
      label: def.label,
      value: show(def, metric, symbol),
      change: (
        <ChangeText
          metric={metric}
          label={compare}
          inverse={def.inverse}
          field={def.field}
          unit={def.unit}
          words
        />
      ),
    };
  });
}

export default function MetricStrip({ items, roomy = false, label }) {
  return (
    <div className={`an-metrics ${roomy ? "an-metrics--roomy" : ""}`}>
      <div
        className="an-metrics__grid"
        style={{ "--cols": items.length }}
        role="list"
        aria-label={label}
      >
        {items.map((item) => (
          <div key={item.key} className="an-metric" role="listitem">
            <p className="an-metric__label">{item.label}</p>
            <p className="an-metric__value">{item.value}</p>
            {item.change && <p className="an-metric__change">{item.change}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
