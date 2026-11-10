import { useMemo } from "react";
import Field from "../ui/Field";
import SalesChart from "../analytics/SalesChart";
import ExportButton from "./ExportButton";
import {
  FinanceNote,
  PrintButton,
  PrintHeader,
  ReportCard,
  ReportState,
  Strip,
} from "./ReportParts";
import { money, pct, whole } from "../../lib/reportFormat";
import { useListParams } from "../../hooks/useListParams";
import { addDays, bucketTitle, useAnalyticsQuery } from "../../lib/analytics";
import { csvMoney, csvNumber } from "../../lib/csv";
import { formatQty } from "../../lib/format";
import { inclusiveDays } from "../../lib/reportRange";
import { getSalesSummary } from "../../data/reports";

const GRANS = ["day", "week", "month"];
const autoGran = (days) =>
  days <= 45 ? "day" : days <= 200 ? "week" : "month";

export default function SalesSummaryPanel({
  businessId,
  businessName,
  symbol,
  range,
  rangeText,
}) {
  const { params, update } = useListParams();
  const days = inclusiveDays(range.from, range.to);
  const raw = params.get("gran");
  // The database allows day-by-day for at most 366 days.
  const granularity =
    GRANS.includes(raw) && !(raw === "day" && days > 366)
      ? raw
      : autoGran(days);

  const { data, loading, error, reload } = useAnalyticsQuery(
    () =>
      getSalesSummary({
        businessId,
        from: range.from,
        to: range.to,
        granularity,
      }),
    [businessId, range.from, range.to, granularity],
  );

  const fin = Boolean(data?.can_view_finance);
  const t = data?.totals;
  const empty =
    Boolean(data) && Number(t.orders) === 0 && Number(t.refunds) === 0;

  const points = useMemo(
    () =>
      data
        ? data.rows.map((r) => ({
            start: r.bucket_start,
            end: r.bucket_end,
            revenue: Number(r.revenue),
            orders: Number(r.orders),
          }))
        : [],
    [data],
  );

  const columns = useMemo(() => {
    const base = [
      { header: "Period start", value: (r) => r.bucket_start },
      { header: "Period end", value: (r) => addDays(r.bucket_end, -1) },
      { header: "Orders", value: (r) => r.orders },
      {
        header: `Gross sales (${symbol})`,
        value: (r) => csvMoney(r.gross_sales),
      },
      { header: `Refunds (${symbol})`, value: (r) => csvMoney(r.refunds) },
      { header: `Revenue (${symbol})`, value: (r) => csvMoney(r.revenue) },
      { header: "Units sold", value: (r) => csvNumber(r.units_sold) },
    ];
    return fin
      ? [
          ...base,
          {
            header: `Cost of goods (${symbol})`,
            value: (r) => csvMoney(r.cogs),
          },
          {
            header: `Gross profit (${symbol})`,
            value: (r) => csvMoney(r.gross_profit),
          },
        ]
      : base;
  }, [symbol, fin]);

  const filename = `ledgerly-sales-summary-${range.from}-to-${range.to}.csv`;

  return (
    <ReportCard
      title="Sales summary"
      subtitle={rangeText}
      actions={
        <>
          <ExportButton
            filename={filename}
            columns={columns}
            rows={data ? () => data.rows : undefined}
            disabled={!data || empty}
          />
          <PrintButton />
        </>
      }
    >
      <PrintHeader
        businessName={businessName}
        title="Sales summary"
        rangeText={rangeText}
      />

      <div className="rp-controls rp-noprint">
        <div className="rp-controls__grid">
          <Field
            as="select"
            label="Group by"
            value={granularity}
            onChange={(e) => update({ gran: e.target.value })}
          >
            <option value="day" disabled={days > 366}>
              Day
            </option>
            <option value="week">Week (Monday start)</option>
            <option value="month">Month</option>
          </Field>
        </div>
      </div>

      <ReportState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={empty}
        emptyTitle="No sales in this range"
        emptyText="Try a wider range of dates."
      >
        {data && (
          <>
            <Strip
              items={[
                { label: "Orders", value: whole(t.orders) },
                { label: "Gross sales", value: money(t.gross_sales, symbol) },
                { label: "Refunds", value: money(t.refunds, symbol) },
                { label: "Revenue", value: money(t.revenue, symbol) },
                { label: "Units sold", value: formatQty(t.units_sold) },
                {
                  label: "Average order",
                  value: money(t.avg_order_value, symbol),
                },
                ...(fin
                  ? [
                      { label: "Cost of goods", value: money(t.cogs, symbol) },
                      {
                        label: "Gross profit",
                        value: money(t.gross_profit, symbol),
                      },
                      { label: "Gross margin", value: pct(t.gross_margin_pct) },
                    ]
                  : []),
              ]}
            />
            {!fin && <FinanceNote />}

            <div className="rp-chart">
              <SalesChart
                points={points}
                granularity={granularity}
                symbol={symbol}
                metricLabel="Revenue"
                showOrders
              />
            </div>

            <div className="table-wrap">
              <table className="table table--stack rp-sum-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="num">Orders</th>
                    <th className="num">Gross sales</th>
                    <th className="num">Refunds</th>
                    <th className="num">Revenue</th>
                    <th className="num">Units</th>
                    {fin && (
                      <>
                        <th className="num">Cost of goods</th>
                        <th className="num">Gross profit</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.bucket_start}>
                      <td className="cell-main">
                        {bucketTitle(
                          { start: r.bucket_start, end: r.bucket_end },
                          granularity,
                        )}
                      </td>
                      <td className="num" data-label="Orders">
                        {r.orders}
                      </td>
                      <td className="num" data-label="Gross sales">
                        {money(r.gross_sales, symbol)}
                      </td>
                      <td className="num" data-label="Refunds">
                        {money(r.refunds, symbol)}
                      </td>
                      <td className="num" data-label="Revenue">
                        {money(r.revenue, symbol)}
                      </td>
                      <td className="num" data-label="Units">
                        {formatQty(r.units_sold)}
                      </td>
                      {fin && (
                        <>
                          <td className="num" data-label="Cost of goods">
                            {money(r.cogs, symbol)}
                          </td>
                          <td className="num" data-label="Gross profit">
                            {money(r.gross_profit, symbol)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="rp-sum">
                  <tr className="rp-total-row">
                    <td className="cell-main">Total</td>
                    <td className="num" data-label="Orders">
                      {t.orders}
                    </td>
                    <td className="num" data-label="Gross sales">
                      {money(t.gross_sales, symbol)}
                    </td>
                    <td className="num" data-label="Refunds">
                      {money(t.refunds, symbol)}
                    </td>
                    <td className="num" data-label="Revenue">
                      {money(t.revenue, symbol)}
                    </td>
                    <td className="num" data-label="Units">
                      {formatQty(t.units_sold)}
                    </td>
                    {fin && (
                      <>
                        <td className="num" data-label="Cost of goods">
                          {money(t.cogs, symbol)}
                        </td>
                        <td className="num" data-label="Gross profit">
                          {money(t.gross_profit, symbol)}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </ReportState>
    </ReportCard>
  );
}
