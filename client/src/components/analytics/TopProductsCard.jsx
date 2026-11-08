import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import ChangeText from "./ChangeText";
import ProductThumb from "../products/ProductThumb";
import { getProductPerformance } from "../../data/analytics";
import { useImageUrls } from "../../hooks/useImageUrls";
import { useAnalyticsQuery } from "../../lib/analytics";
import { formatMoney, formatQty } from "../../lib/format";

export default function TopProductsCard({ businessId, from, to, symbol }) {
  const { data, loading, error, reload } = useAnalyticsQuery(
    () =>
      getProductPerformance({
        businessId,
        from,
        to,
        rank: "top_revenue",
        limit: 5,
        offset: 0,
      }),
    [businessId, from, to],
  );
  const rows = data?.rows ?? [];
  const urls = useImageUrls(rows.map((r) => r.image_path));

  return (
    <section className="card" aria-busy={loading}>
      <div className="an-card-head">
        <div>
          <h2 className="card__title">Top products</h2>
          <p className="card__sub">Your strongest products by revenue.</p>
        </div>
        <Link className="an-card-link" to="/products">
          View all products <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {error ? (
        <div className="alert alert--danger" role="alert">
          Could not load top products: {error}{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="an-skeleton an-skeleton--value"
              style={{ width: "100%" }}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <h3 className="card__title">No sales in this period yet</h3>
          <p className="card__sub">Your best sellers will show up here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Units sold</th>
                <th className="num">Revenue</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id}>
                  <td className="cell-main">
                    <div className="an-pline">
                      <ProductThumb url={urls[r.image_path]} />
                      <div>
                        <p className="an-pline__name">{r.product_name}</p>
                        <ChangeText
                          metric={{
                            current: r.revenue,
                            change_pct: r.revenue_change_pct,
                          }}
                          label="vs last period"
                        />
                      </div>
                    </div>
                  </td>
                  <td className="num" data-label="Units sold">
                    {formatQty(r.units_sold)}
                  </td>
                  <td className="num" data-label="Revenue">
                    {formatMoney(r.revenue, symbol)}
                  </td>
                  <td data-label="Performance">
                    <div className="progress">
                      <span className="progress__track">
                        <span
                          className="progress__bar"
                          style={{ width: `${r.share_of_best_pct}%` }}
                        />
                      </span>
                      <span className="progress__value">
                        {r.share_of_best_pct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
