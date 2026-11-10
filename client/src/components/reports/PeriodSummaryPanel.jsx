import { useMemo } from "react";
import Field from "../ui/Field";
import ExportButton from "./ExportButton";
import {
  FinanceNote,
  PrintButton,
  PrintHeader,
  ReportCard,
  ReportState,
} from "./ReportParts";
import { money } from "../../lib/reportFormat";
import { useListParams } from "../../hooks/useListParams";
import {
  monthLong,
  todayInLagos,
  useAnalyticsQuery,
} from "../../lib/analytics";
import { csvMoney, csvNumber } from "../../lib/csv";
import { formatQty } from "../../lib/format";
import { getPeriodSummary } from "../../data/reports";

const thisYear = Number(todayInLagos().slice(0, 4));
const YEARS = Array.from({ length: 10 }, (_, i) => thisYear - i);

export default function PeriodSummaryPanel({
  businessId,
  businessName,
  symbol,
}) {
  const { params, update } = useListParams();
  const mode = params.get("mode") === "year" ? "year" : "month";
  const rawYear = Number(params.get("year"));
  const year = YEARS.includes(rawYear) ? rawYear : thisYear;

  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getPeriodSummary({ businessId, mode, year }),
    [businessId, mode, year],
  );

  const fin = Boolean(data?.can_view_finance);
  const t = data?.totals;
  const empty =
    Boolean(data) &&
    Number(t.orders) === 0 &&
    Number(t.refunds) === 0 &&
    !(fin && Number(t.operating_expenses) > 0);
  const label = (r) =>
    mode === "month" ? monthLong(r.bucket_start) : r.bucket_start.slice(0, 4);

  const columns = useMemo(() => {
    const base = [
      { header: mode === "month" ? "Month" : "Year", value: label },
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
          {
            header: `Operating expenses (${symbol})`,
            value: (r) => csvMoney(r.operating_expenses),
          },
          {
            header: `Net profit (${symbol})`,
            value: (r) => csvMoney(r.net_profit),
          },
        ]
      : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, fin, mode]);

  const title =
    mode === "month"
      ? `Monthly summary for ${year}`
      : `Yearly summary to ${year}`;
  const subtitle =
    mode === "month"
      ? `January to December ${year}, month by month`
      : `Up to 10 years ending in ${year}, starting from your first sale or expense`;

  return (
    <ReportCard
      title={title}
      subtitle={subtitle}
      actions={
        <>
          <ExportButton
            filename={`ledgerly-${mode === "month" ? "monthly" : "yearly"}-summary-${year}.csv`}
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
        title={title}
        rangeText={subtitle}
      />

      <div className="rp-controls rp-noprint">
        <div className="rp-controls__grid">
          <Field
            as="select"
            label="Summary"
            value={mode}
            onChange={(e) =>
              update({ mode: e.target.value === "month" ? "" : e.target.value })
            }
          >
            <option value="month">Month by month</option>
            <option value="year">Year by year</option>
          </Field>
          <Field
            as="select"
            label={mode === "month" ? "Year" : "Up to year"}
            value={String(year)}
            onChange={(e) =>
              update({
                year: Number(e.target.value) === thisYear ? "" : e.target.value,
              })
            }
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Field>
        </div>
      </div>

      <ReportState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={empty}
        emptyTitle={`No activity in ${year}`}
        emptyText="Pick another year to see a different summary."
      >
        {data && (
          <>
            {!fin && <FinanceNote />}
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>{mode === "month" ? "Month" : "Year"}</th>
                    <th className="num">Orders</th>
                    <th className="num">Gross sales</th>
                    <th className="num">Refunds</th>
                    <th className="num">Revenue</th>
                    <th className="num">Units</th>
                    {fin && (
                      <>
                        <th className="num">Cost of goods</th>
                        <th className="num">Gross profit</th>
                        <th className="num">Expenses</th>
                        <th className="num">Net profit</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.bucket_start}>
                      <td className="cell-main">{label(r)}</td>
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
                          <td className="num" data-label="Expenses">
                            {money(r.operating_expenses, symbol)}
                          </td>
                          <td className="num" data-label="Net profit">
                            {money(r.net_profit, symbol)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
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
                        <td className="num" data-label="Expenses">
                          {money(t.operating_expenses, symbol)}
                        </td>
                        <td className="num" data-label="Net profit">
                          {money(t.net_profit, symbol)}
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
