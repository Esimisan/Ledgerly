import { useMemo } from "react";
import ExportButton from "./ExportButton";
import {
  PagerBar,
  PrintButton,
  PrintHeader,
  ReportCard,
  ReportState,
  SearchBox,
} from "./ReportParts";
import { money } from "../../lib/reportFormat";
import { useListParams } from "../../hooks/useListParams";
import { useAnalyticsQuery } from "../../lib/analytics";
import { csvMoney, csvNumber } from "../../lib/csv";
import { formatQty } from "../../lib/format";
import { listInventoryMovements, toPage } from "../../data/reports";

export default function InventoryMovementsPanel({
  businessId,
  businessName,
  symbol,
  canFinance,
  range,
  rangeText,
}) {
  const { params, update } = useListParams();
  const q = params.get("q") ?? "";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const { data, loading, error, reload } = useAnalyticsQuery(
    () =>
      listInventoryMovements({
        businessId,
        from: range.from,
        to: range.to,
        search: q,
        page,
      }),
    [businessId, range.from, range.to, q, page],
  );

  const columns = useMemo(() => {
    const base = [
      { header: "Product", value: (r) => r.product_name },
      { header: "SKU", value: (r) => r.sku },
      { header: "Unit", value: (r) => r.unit },
      { header: "Opening stock at start", value: (r) => csvNumber(r.opening) },
      {
        header: "Opening stock entered in period",
        value: (r) => csvNumber(r.opening_stock_added),
      },
      { header: "Purchased", value: (r) => csvNumber(r.purchased) },
      { header: "Sold", value: (r) => csvNumber(r.sold) },
      { header: "Returned by customers", value: (r) => csvNumber(r.returned) },
      { header: "Damaged", value: (r) => csvNumber(r.damaged) },
      { header: "Removed", value: (r) => csvNumber(r.removed) },
      { header: "Adjusted", value: (r) => csvNumber(r.adjusted) },
      { header: "Closing stock at end", value: (r) => csvNumber(r.closing) },
    ];
    return canFinance
      ? [
          ...base,
          {
            header: `Purchase value (${symbol})`,
            value: (r) => csvMoney(r.purchase_value),
          },
        ]
      : base;
  }, [symbol, canFinance]);

  const fetchExportPage = (pg, pageSize) =>
    listInventoryMovements({
      businessId,
      from: range.from,
      to: range.to,
      search: q,
      page: pg,
      pageSize,
    }).then(toPage);

  return (
    <ReportCard
      title="Inventory movements"
      subtitle={`${rangeText} · what happened to each product's stock`}
      actions={
        <>
          <ExportButton
            filename={`ledgerly-inventory-movements-${range.from}-to-${range.to}.csv`}
            columns={columns}
            fetchPage={fetchExportPage}
            disabled={!data || data.total === 0}
          />
          <PrintButton />
        </>
      }
    >
      <PrintHeader
        businessName={businessName}
        title="Inventory movements"
        rangeText={rangeText}
      />

      <SearchBox
        value={q}
        onChange={(v) => update({ q: v })}
        label="Search products"
        placeholder="Search product name or SKU"
      />
      <p className="info-note rp-noprint">
        Closing stock is the stock at the end of the last day. It matches your
        stock today only when the range runs up to today. "Added" is stock
        bought plus opening stock entered in the period.
      </p>

      <ReportState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={Boolean(data) && data.rows.length === 0}
        emptyTitle={
          q
            ? "No products match your search"
            : "No stock movement in this range"
        }
        emptyText={
          q
            ? "Try a different search."
            : "No stock came in or went out in these dates."
        }
        emptyAction={
          page > 1 ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => update({ page: "" })}
            >
              Back to page 1
            </button>
          ) : null
        }
      >
        {data && (
          <>
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Opening</th>
                    <th className="num">Added</th>
                    <th className="num">Sold</th>
                    <th className="num">Returned</th>
                    <th className="num">Damaged</th>
                    <th className="num">Removed</th>
                    <th className="num">Adjusted</th>
                    <th className="num">Closing</th>
                    {canFinance && <th className="num">Bought value</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const added =
                      Number(r.purchased) + Number(r.opening_stock_added);
                    const adj = Number(r.adjusted);
                    return (
                      <tr key={r.product_id}>
                        <td className="cell-main">
                          <div className="product-cell__name">
                            {r.product_name}{" "}
                            {r.is_deleted && (
                              <span className="badge badge--danger">
                                Deleted
                              </span>
                            )}
                          </div>
                          <div className="product-cell__sub">
                            {r.sku || "No SKU"} · {r.unit}
                          </div>
                        </td>
                        <td className="num" data-label="Opening">
                          {formatQty(r.opening)}
                        </td>
                        <td className="num" data-label="Added">
                          {formatQty(added)}
                        </td>
                        <td className="num" data-label="Sold">
                          {formatQty(r.sold)}
                        </td>
                        <td className="num" data-label="Returned">
                          {formatQty(r.returned)}
                        </td>
                        <td className="num" data-label="Damaged">
                          {formatQty(r.damaged)}
                        </td>
                        <td className="num" data-label="Removed">
                          {formatQty(r.removed)}
                        </td>
                        <td className="num" data-label="Adjusted">
                          {adj > 0 ? "+" : ""}
                          {formatQty(adj)}
                        </td>
                        <td className="num" data-label="Closing">
                          {formatQty(r.closing)}
                        </td>
                        {canFinance && (
                          <td className="num" data-label="Bought value">
                            {money(r.purchase_value, symbol)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PagerBar
              page={page}
              total={data.total}
              onPage={(n) => update({ page: n > 1 ? String(n) : "" })}
            />
          </>
        )}
      </ReportState>
    </ReportCard>
  );
}
