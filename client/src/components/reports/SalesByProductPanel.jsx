import { useMemo } from "react";
import Field from "../ui/Field";
import ExportButton from "./ExportButton";
import SortHeader from "./SortHeader";
import {
  FinanceNote,
  PagerBar,
  PrintButton,
  PrintHeader,
  ReportCard,
  ReportState,
  SearchBox,
} from "./ReportParts";
import { money, pct } from "../../lib/reportFormat";
import { useListParams } from "../../hooks/useListParams";
import { useAnalyticsQuery } from "../../lib/analytics";
import { csvMoney, csvNumber } from "../../lib/csv";
import { formatQty } from "../../lib/format";
import {
  REPORT_PRODUCT_SORTS,
  listSalesByProduct,
  toPage,
} from "../../data/reports";

const DEFAULT_SORT = "revenue:desc";
const KEYS = {
  name: [
    { key: "name:asc", dir: "asc" },
    { key: "name:desc", dir: "desc" },
  ],
  units: [
    { key: "units:desc", dir: "desc" },
    { key: "units:asc", dir: "asc" },
  ],
  revenue: [
    { key: "revenue:desc", dir: "desc" },
    { key: "revenue:asc", dir: "asc" },
  ],
  profit: [
    { key: "profit:desc", dir: "desc" },
    { key: "profit:asc", dir: "asc" },
  ],
  margin: [
    { key: "margin:desc", dir: "desc" },
    { key: "margin:asc", dir: "asc" },
  ],
};

export default function SalesByProductPanel({
  businessId,
  businessName,
  symbol,
  canFinance,
  range,
  rangeText,
}) {
  const { params, update } = useListParams();
  const q = params.get("q") ?? "";
  const rawSort = params.get("sort");
  const def = REPORT_PRODUCT_SORTS[rawSort];
  const sort = def && (!def.finance || canFinance) ? rawSort : DEFAULT_SORT;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const { data, loading, error, reload } = useAnalyticsQuery(
    () =>
      listSalesByProduct({
        businessId,
        from: range.from,
        to: range.to,
        search: q,
        sort,
        page,
      }),
    [businessId, range.from, range.to, q, sort, page],
  );

  const changeSort = (key) =>
    update({ sort: !key || key === DEFAULT_SORT ? "" : key });
  const t = data?.totals;

  const columns = useMemo(() => {
    const base = [
      { header: "Rank", value: (r) => r.rank_no },
      { header: "Product", value: (r) => r.product_name },
      { header: "SKU", value: (r) => r.sku },
      { header: "Category", value: (r) => r.category_name },
      { header: "Units sold", value: (r) => csvNumber(r.units_sold) },
      { header: `Revenue (${symbol})`, value: (r) => csvMoney(r.revenue) },
    ];
    const finance = [
      { header: `Cost of goods (${symbol})`, value: (r) => csvMoney(r.cogs) },
      {
        header: `Gross profit (${symbol})`,
        value: (r) => csvMoney(r.gross_profit),
      },
      { header: "Margin (%)", value: (r) => csvNumber(r.margin_pct) },
    ];
    return [
      ...base,
      ...(canFinance ? finance : []),
      { header: "In stock now", value: (r) => csvNumber(r.quantity_on_hand) },
    ];
  }, [symbol, canFinance]);

  const fetchExportPage = (pg, pageSize) =>
    listSalesByProduct({
      businessId,
      from: range.from,
      to: range.to,
      search: q,
      sort,
      page: pg,
      pageSize,
    }).then(toPage);

  return (
    <ReportCard
      title="Sales by product"
      subtitle={rangeText}
      actions={
        <>
          <ExportButton
            filename={`ledgerly-sales-by-product-${range.from}-to-${range.to}.csv`}
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
        title="Sales by product"
        rangeText={rangeText}
      />

      <SearchBox
        value={q}
        onChange={(v) => update({ q: v })}
        label="Search products"
        placeholder="Search product name or SKU"
      />
      <div className="rp-controls rp-noprint">
        <div className="rp-controls__grid">
          <Field
            as="select"
            label="Sort by"
            value={sort}
            onChange={(e) => changeSort(e.target.value)}
          >
            {Object.entries(REPORT_PRODUCT_SORTS)
              .filter(([, s]) => !s.finance || canFinance)
              .map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
          </Field>
        </div>
      </div>

      <ReportState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={Boolean(data) && data.rows.length === 0}
        emptyTitle={
          q ? "No products match your search" : "No product sales in this range"
        }
        emptyText={
          q ? "Try a different search." : "Try a wider range of dates."
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
            {!canFinance && <FinanceNote />}
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <SortHeader
                      label="Product"
                      keys={KEYS.name}
                      current={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      label="Units sold"
                      className="num"
                      keys={KEYS.units}
                      current={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      label="Revenue"
                      className="num"
                      keys={KEYS.revenue}
                      current={sort}
                      onSort={changeSort}
                    />
                    {canFinance && (
                      <>
                        <th className="num">Cost of goods</th>
                        <SortHeader
                          label="Gross profit"
                          className="num"
                          keys={KEYS.profit}
                          current={sort}
                          onSort={changeSort}
                        />
                        <SortHeader
                          label="Margin"
                          className="num"
                          keys={KEYS.margin}
                          current={sort}
                          onSort={changeSort}
                        />
                      </>
                    )}
                    <th className="num">In stock</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr
                      key={r.product_id}
                      className={r.is_active ? "" : "is-inactive"}
                    >
                      <td className="cell-main">
                        <div className="product-cell__name">
                          {r.product_name}
                        </div>
                        <div className="product-cell__sub">
                          {r.sku || "No SKU"}
                          {r.category_name ? ` · ${r.category_name}` : ""}
                        </div>
                      </td>
                      <td className="num" data-label="Units sold">
                        {formatQty(r.units_sold)} {r.unit}
                      </td>
                      <td className="num" data-label="Revenue">
                        {money(r.revenue, symbol)}
                      </td>
                      {canFinance && (
                        <>
                          <td className="num" data-label="Cost of goods">
                            {money(r.cogs, symbol)}
                          </td>
                          <td className="num" data-label="Gross profit">
                            {money(r.gross_profit, symbol)}
                          </td>
                          <td className="num" data-label="Margin">
                            {pct(r.margin_pct)}
                          </td>
                        </>
                      )}
                      <td className="num" data-label="In stock">
                        {formatQty(r.quantity_on_hand)} {r.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="rp-total-row">
                    <td className="cell-main">
                      All matching products ({data.total})
                    </td>
                    <td className="num" data-label="Units sold">
                      {formatQty(t.units)}
                    </td>
                    <td className="num" data-label="Revenue">
                      {money(t.revenue, symbol)}
                    </td>
                    {canFinance && (
                      <>
                        <td className="num" data-label="Cost of goods">
                          {money(t.cogs, symbol)}
                        </td>
                        <td className="num" data-label="Gross profit">
                          {money(t.grossProfit, symbol)}
                        </td>
                        <td className="num" data-label="Margin">
                          {Number(t.revenue) !== 0 && t.grossProfit != null
                            ? pct(
                                Math.round(
                                  (Number(t.grossProfit) / Number(t.revenue)) *
                                    1000,
                                ) / 10,
                              )
                            : "—"}
                        </td>
                      </>
                    )}
                    <td />
                  </tr>
                </tfoot>
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
