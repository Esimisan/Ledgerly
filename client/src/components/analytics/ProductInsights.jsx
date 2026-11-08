import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import ChangeText from "./ChangeText";
import Field from "../ui/Field";
import Pagination from "../ui/Pagination";
import ProductThumb from "../products/ProductThumb";
import { getProductPerformance, getStockWatch } from "../../data/analytics";
import { PAGE_SIZE } from "../../data/products";
import { useImageUrls } from "../../hooks/useImageUrls";
import { monthLong, useAnalyticsQuery } from "../../lib/analytics";
import { formatDate, formatMoney, formatQty } from "../../lib/format";

const PERFORMANCE = [
  {
    key: "best_units",
    label: "Best sellers",
    note: "Products that sold the most units this month.",
  },
  {
    key: "top_revenue",
    label: "Top revenue",
    note: "Products that brought in the most money this month.",
  },
  {
    key: "worst_units",
    label: "Worst sellers",
    note: "Fewest units sold, including products with no sales. Products with the most stock sitting unsold come first.",
  },
  {
    key: "declining",
    label: "Declining sales",
    note: "Sales fell by 10% or more compared with last month, for products that sold at least 3 units then.",
  },
  {
    key: "most_profitable",
    label: "Most profitable",
    finance: true,
    note: "Profit after the cost of the goods sold, for products with sales this month.",
  },
  {
    key: "least_profitable",
    label: "Least profitable",
    finance: true,
    note: "The thinnest profit after the cost of the goods sold, for products with sales this month.",
  },
];

const STOCK = [
  {
    key: "low",
    label: "Low stock",
    note: "Out of stock, or at or below the minimum stock level.",
  },
  {
    key: "approaching",
    label: "Running low soon",
    note: "Not low yet, but at the last 30 days’ sales pace they run out within 14 days.",
  },
  {
    key: "unsold",
    label: "Not selling",
    note: "In stock, older than 30 days, and not sold in the last 30 days.",
  },
];

function StatusBadge({ qty, min }) {
  if (Number(qty) <= 0)
    return <span className="badge badge--danger">Out of stock</span>;
  if (Number(min) > 0 && Number(qty) <= Number(min))
    return <span className="badge badge--warning">Low stock</span>;
  return <span className="badge badge--success">In stock</span>;
}

export default function ProductInsights({
  businessId,
  from,
  to,
  symbol,
  canFinance,
}) {
  const [view, setView] = useState("performance");
  const [choice, setChoice] = useState({
    performance: "best_units",
    stock: "low",
  });
  const [page, setPage] = useState(1);

  const stock = view === "stock";
  const options = stock
    ? STOCK
    : PERFORMANCE.filter((o) => !o.finance || canFinance);
  const current = options.find((o) => o.key === choice[view]) ?? options[0];

  useEffect(() => setPage(1), [from, to, view, current.key]);

  const offset = (page - 1) * PAGE_SIZE;
  const { data, loading, error, reload } = useAnalyticsQuery(
    () =>
      stock
        ? getStockWatch({
            businessId,
            kind: current.key,
            limit: PAGE_SIZE,
            offset,
          })
        : getProductPerformance({
            businessId,
            from,
            to,
            rank: current.key,
            limit: PAGE_SIZE,
            offset,
          }),
    [businessId, from, to, view, current.key, page],
  );
  const rows = data?.rows ?? [];
  const urls = useImageUrls(rows.map((r) => r.image_path));
  const showProfit = canFinance && !stock;

  const lastCol =
    current.key === "approaching"
      ? "Days of stock left"
      : current.key === "unsold"
        ? "Last sold"
        : null;

  return (
    <section className="card" aria-busy={loading} aria-labelledby="an-products">
      <div className="an-head">
        <div>
          <p className="an-eyebrow">Product analytics</p>
          <h2 className="an-head__title" id="an-products">
            {stock ? "Stock health" : "Product performance"}
          </h2>
          <p className="an-head__sub">
            See what is selling, what is not, and what needs restocking.
          </p>
        </div>
        <div
          className="segmented"
          role="radiogroup"
          aria-label="Product analytics view"
        >
          {[
            ["performance", "Product performance"],
            ["stock", "Stock health"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={view === key}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="an-toolbar">
        <Field
          as="select"
          label="Analysis"
          value={current.key}
          onChange={(e) => setChoice((c) => ({ ...c, [view]: e.target.value }))}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Field>
        <p className="an-toolbar__note">
          {stock ? (
            "Showing stock as it is today"
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
            <Package size={22} aria-hidden="true" />
          </span>
          <h3 className="card__title">No products to show</h3>
          <p className="card__sub">
            There are no products matching “{current.label}”{" "}
            {stock ? "right now" : `for ${monthLong(from)}`}.
          </p>
        </div>
      ) : (
        <>
          <div className={`table-wrap ${loading ? "an-busy" : ""}`}>
            <table className="table table--stack">
              <thead>
                {stock ? (
                  <tr>
                    <th>Product</th>
                    <th className="num">Current stock</th>
                    <th className="num">Minimum level</th>
                    <th className="num">Sold, last 30 days</th>
                    {lastCol && <th>{lastCol}</th>}
                    <th>Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Product</th>
                    <th className="num">Units sold</th>
                    <th className="num">Revenue</th>
                    {showProfit && <th className="num">Gross profit</th>}
                    <th className="num">Current stock</th>
                    <th>Status</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.product_id}>
                    <td className="cell-main">
                      <div className="an-pline">
                        <ProductThumb url={urls[r.image_path]} />
                        <div>
                          <p className="an-pline__name">{r.product_name}</p>
                          <p className="an-pline__sub">
                            {r.sku || "No SKU"}
                            {r.is_active === false ? " · Inactive" : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    {stock ? (
                      <>
                        <td className="num" data-label="Current stock">
                          {formatQty(r.quantity_on_hand)} {r.unit}
                        </td>
                        <td className="num" data-label="Minimum level">
                          {Number(r.min_stock_level) > 0
                            ? formatQty(r.min_stock_level)
                            : "—"}
                        </td>
                        <td className="num" data-label="Sold, last 30 days">
                          {formatQty(r.units_30d)}
                        </td>
                        {lastCol && (
                          <td data-label={lastCol}>
                            {current.key === "approaching"
                              ? `${r.days_of_cover} days`
                              : r.last_sold_at
                                ? formatDate(r.last_sold_at)
                                : "Never"}
                          </td>
                        )}
                      </>
                    ) : (
                      <>
                        <td className="num" data-label="Units sold">
                          {formatQty(r.units_sold)}
                        </td>
                        <td className="num" data-label="Revenue">
                          <div className="an-cell-stack">
                            <span>{formatMoney(r.revenue, symbol)}</span>
                            <ChangeText
                              metric={{
                                current: r.revenue,
                                change_pct: r.revenue_change_pct,
                              }}
                              words
                            />
                          </div>
                        </td>
                        {showProfit && (
                          <td className="num" data-label="Gross profit">
                            {r.gross_profit == null
                              ? "—"
                              : formatMoney(r.gross_profit, symbol)}
                          </td>
                        )}
                        <td className="num" data-label="Current stock">
                          {formatQty(r.quantity_on_hand)} {r.unit}
                        </td>
                      </>
                    )}
                    <td data-label="Status">
                      <StatusBadge
                        qty={r.quantity_on_hand}
                        min={r.min_stock_level}
                      />
                    </td>
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
