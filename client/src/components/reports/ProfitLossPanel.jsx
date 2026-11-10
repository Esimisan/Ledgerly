import { useMemo } from "react";
import ExportButton from "./ExportButton";
import {
  PrintButton,
  PrintHeader,
  ReportCard,
  ReportState,
} from "./ReportParts";
import { money, pct, whole } from "../../lib/reportFormat";
import { useAnalyticsQuery } from "../../lib/analytics";
import { csvMoney } from "../../lib/csv";
import { getProfitAndLoss } from "../../data/reports";

const neg = (v) => (Number(v) === 0 ? 0 : -Number(v));

export default function ProfitLossPanel({
  businessId,
  businessName,
  symbol,
  range,
  rangeText,
}) {
  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getProfitAndLoss({ businessId, from: range.from, to: range.to }),
    [businessId, range.from, range.to],
  );

  const d = data;
  const empty =
    Boolean(d) &&
    Number(d.orders) === 0 &&
    Number(d.refunds) === 0 &&
    Number(d.operating_expenses) === 0;

  // The statement as flat lines, for the CSV (signs match what is on screen).
  const lines = useMemo(() => {
    if (!d) return [];
    return [
      { section: "Revenue", line: "Gross sales", amount: d.gross_sales },
      { section: "Revenue", line: "Less: refunds", amount: neg(d.refunds) },
      { section: "Revenue", line: "Revenue", amount: d.revenue },
      {
        section: "Cost of goods",
        line: "Less: cost of goods sold",
        amount: neg(d.cogs),
      },
      { section: "Profit", line: "Gross profit", amount: d.gross_profit },
      {
        section: "Operating expenses",
        line: "Less: operating expenses",
        amount: neg(d.operating_expenses),
      },
      ...d.expense_categories.map((c) => ({
        section: "Operating expenses",
        line: c.category_name,
        amount: c.total,
        share: c.share_pct,
      })),
      { section: "Profit", line: "Net profit", amount: d.net_profit },
    ];
  }, [d]);

  const columns = useMemo(
    () => [
      { header: "Section", value: (r) => r.section },
      { header: "Line", value: (r) => r.line },
      { header: `Amount (${symbol})`, value: (r) => csvMoney(r.amount) },
      {
        header: "Share of expenses (%)",
        value: (r) => (r.share == null ? "" : Number(r.share)),
      },
    ],
    [symbol],
  );

  return (
    <ReportCard
      title="Profit and loss"
      subtitle={rangeText}
      actions={
        <>
          <ExportButton
            filename={`ledgerly-profit-and-loss-${range.from}-to-${range.to}.csv`}
            columns={columns}
            rows={d ? () => lines : undefined}
            disabled={!d || empty}
          />
          <PrintButton />
        </>
      }
    >
      <PrintHeader
        businessName={businessName}
        title="Profit and loss"
        rangeText={rangeText}
      />

      <ReportState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={empty}
        emptyTitle="Nothing to report for this range"
        emptyText="There are no sales, refunds or expenses in these dates. Try a wider range."
      >
        {d && (
          <table className="rp-statement">
            <tbody>
              <tr>
                <td>
                  Gross sales{" "}
                  <span className="rp-muted">
                    ({whole(d.orders)}{" "}
                    {Number(d.orders) === 1 ? "order" : "orders"})
                  </span>
                </td>
                <td>{money(d.gross_sales, symbol)}</td>
              </tr>
              <tr className="rp-statement__sub">
                <td>Less: refunds</td>
                <td>{money(neg(d.refunds), symbol)}</td>
              </tr>
              <tr className="rp-statement__total">
                <td>Revenue</td>
                <td>{money(d.revenue, symbol)}</td>
              </tr>
              <tr>
                <td>Less: cost of goods sold</td>
                <td>{money(neg(d.cogs), symbol)}</td>
              </tr>
              <tr className="rp-statement__total">
                <td>Gross profit</td>
                <td>{money(d.gross_profit, symbol)}</td>
              </tr>
              <tr className="rp-statement__sub">
                <td>Gross margin</td>
                <td>{pct(d.gross_margin_pct)}</td>
              </tr>
              <tr>
                <td>Less: operating expenses</td>
                <td>{money(neg(d.operating_expenses), symbol)}</td>
              </tr>
              {d.expense_categories.map((c) => (
                <tr className="rp-statement__sub" key={c.category_id}>
                  <td>
                    {c.category_name}{" "}
                    <span className="rp-muted">· {pct(c.share_pct)}</span>
                  </td>
                  <td>{money(c.total, symbol)}</td>
                </tr>
              ))}
              <tr className="rp-statement__total rp-statement__grand">
                <td>Net profit</td>
                <td>{money(d.net_profit, symbol)}</td>
              </tr>
              <tr className="rp-statement__sub">
                <td>Net margin</td>
                <td>{pct(d.net_margin_pct)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </ReportState>
    </ReportCard>
  );
}
