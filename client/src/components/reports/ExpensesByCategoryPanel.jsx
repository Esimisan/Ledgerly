import { useMemo } from "react";
import ExportButton from "./ExportButton";
import {
  PrintButton,
  PrintHeader,
  ReportCard,
  ReportState,
  Strip,
} from "./ReportParts";
import { money, pct, whole } from "../../lib/reportFormat";
import { useAnalyticsQuery } from "../../lib/analytics";
import { csvMoney } from "../../lib/csv";
import { getExpensesByCategory } from "../../data/reports";

export default function ExpensesByCategoryPanel({
  businessId,
  businessName,
  symbol,
  range,
  rangeText,
}) {
  const { data, loading, error, reload } = useAnalyticsQuery(
    () => getExpensesByCategory({ businessId, from: range.from, to: range.to }),
    [businessId, range.from, range.to],
  );

  const columns = useMemo(
    () => [
      { header: "Category", value: (r) => r.category_name },
      { header: "Expenses", value: (r) => r.expense_count },
      { header: `Total (${symbol})`, value: (r) => csvMoney(r.total) },
      {
        header: "Share (%)",
        value: (r) => (r.share_pct == null ? "" : Number(r.share_pct)),
      },
    ],
    [symbol],
  );

  const rows = data?.rows ?? [];

  return (
    <ReportCard
      title="Expenses by category"
      subtitle={`${rangeText} · voided expenses are left out`}
      actions={
        <>
          <ExportButton
            filename={`ledgerly-expenses-by-category-${range.from}-to-${range.to}.csv`}
            columns={columns}
            rows={data ? () => data.rows : undefined}
            disabled={!data || rows.length === 0}
          />
          <PrintButton />
        </>
      }
    >
      <PrintHeader
        businessName={businessName}
        title="Expenses by category"
        rangeText={rangeText}
      />

      <ReportState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={Boolean(data) && rows.length === 0}
        emptyTitle="No expenses in this range"
        emptyText="Try a wider range of dates."
      >
        {data && (
          <>
            <Strip
              items={[
                { label: "Total spent", value: money(data.grandTotal, symbol) },
                { label: "Expenses", value: whole(data.grandCount) },
                {
                  label: "Largest category",
                  value: rows[0]?.category_name ?? "—",
                },
              ]}
            />
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Expenses</th>
                    <th className="num">Total</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.category_id}>
                      <td className="cell-main">{r.category_name}</td>
                      <td className="num" data-label="Expenses">
                        {r.expense_count}
                      </td>
                      <td className="num" data-label="Total">
                        {money(r.total, symbol)}
                      </td>
                      <td data-label="Share">
                        <div className="rp-share">
                          <span className="rp-share__track">
                            <span
                              className="rp-share__fill"
                              style={{
                                width: `${Math.min(100, Number(r.share_pct) || 0)}%`,
                              }}
                            />
                          </span>
                          <span>{pct(r.share_pct)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="rp-total-row">
                    <td className="cell-main">Total</td>
                    <td className="num" data-label="Expenses">
                      {whole(data.grandCount)}
                    </td>
                    <td className="num" data-label="Total">
                      {money(data.grandTotal, symbol)}
                    </td>
                    <td />
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
