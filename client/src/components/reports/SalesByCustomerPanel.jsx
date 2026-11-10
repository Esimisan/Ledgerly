import { useMemo } from "react";
import { Link } from "react-router-dom";
import Field from "../ui/Field";
import ExportButton from "./ExportButton";
import SortHeader from "./SortHeader";
import {
  PagerBar,
  PrintButton,
  PrintHeader,
  ReportCard,
  ReportState,
  SearchBox,
} from "./ReportParts";
import { money, whole } from "../../lib/reportFormat";
import { useListParams } from "../../hooks/useListParams";
import { useAnalyticsQuery } from "../../lib/analytics";
import { csvDate, csvMoney } from "../../lib/csv";
import { formatDate } from "../../lib/format";
import {
  REPORT_CUSTOMER_SORTS,
  listSalesByCustomer,
  toPage,
} from "../../data/reports";

const DEFAULT_SORT = "spent:desc";
const KEYS = {
  name: [
    { key: "name:asc", dir: "asc" },
    { key: "name:desc", dir: "desc" },
  ],
  orders: [
    { key: "orders:desc", dir: "desc" },
    { key: "orders:asc", dir: "asc" },
  ],
  spent: [
    { key: "spent:desc", dir: "desc" },
    { key: "spent:asc", dir: "asc" },
  ],
  last: [
    { key: "last_purchase:desc", dir: "desc" },
    { key: "last_purchase:asc", dir: "asc" },
  ],
};

function Balance({ value, symbol }) {
  const n = Number(value);
  if (value == null || n === 0) return "—";
  return n > 0 ? (
    <span className="balance--owes">Owes {money(n, symbol)}</span>
  ) : (
    <span className="balance--credit">Credit {money(Math.abs(n), symbol)}</span>
  );
}

export default function SalesByCustomerPanel({
  businessId,
  businessName,
  symbol,
  range,
  rangeText,
}) {
  const { params, update } = useListParams();
  const q = params.get("q") ?? "";
  const rawSort = params.get("sort");
  const sort = REPORT_CUSTOMER_SORTS[rawSort] ? rawSort : DEFAULT_SORT;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const { data, loading, error, reload } = useAnalyticsQuery(
    () =>
      listSalesByCustomer({
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

  const columns = useMemo(
    () => [
      { header: "Customer", value: (r) => r.customer_name },
      { header: "Phone", value: (r) => r.phone },
      { header: "Orders", value: (r) => r.orders },
      {
        header: `Gross sales (${symbol})`,
        value: (r) => csvMoney(r.gross_sales),
      },
      { header: `Refunds (${symbol})`, value: (r) => csvMoney(r.refunds) },
      { header: `Net spent (${symbol})`, value: (r) => csvMoney(r.net_spent) },
      { header: "Last purchase", value: (r) => csvDate(r.last_purchase_at) },
      {
        header: `Balance (${symbol}, positive = owes)`,
        value: (r) => csvMoney(r.balance),
      },
    ],
    [symbol],
  );

  const fetchExportPage = (pg, pageSize) =>
    listSalesByCustomer({
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
      title="Sales by customer"
      subtitle={rangeText}
      actions={
        <>
          <ExportButton
            filename={`ledgerly-sales-by-customer-${range.from}-to-${range.to}.csv`}
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
        title="Sales by customer"
        rangeText={rangeText}
      />

      <SearchBox
        value={q}
        onChange={(v) => update({ q: v })}
        label="Search customers"
        placeholder="Search customer name or phone"
      />
      <div className="rp-controls rp-noprint">
        <div className="rp-controls__grid">
          <Field
            as="select"
            label="Sort by"
            value={sort}
            onChange={(e) => changeSort(e.target.value)}
          >
            {Object.entries(REPORT_CUSTOMER_SORTS).map(([key, s]) => (
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
          q ? "No customers match your search" : "No sales in this range"
        }
        emptyText={
          q
            ? "Try a different search. Walk-in sales are left out when you search."
            : "Try a wider range of dates."
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
                    <SortHeader
                      label="Customer"
                      keys={KEYS.name}
                      current={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      label="Orders"
                      className="num"
                      keys={KEYS.orders}
                      current={sort}
                      onSort={changeSort}
                    />
                    <th className="num">Gross sales</th>
                    <th className="num">Refunds</th>
                    <SortHeader
                      label="Net spent"
                      className="num"
                      keys={KEYS.spent}
                      current={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      label="Last purchase"
                      keys={KEYS.last}
                      current={sort}
                      onSort={changeSort}
                    />
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.customer_id ?? "walk-in"}>
                      <td className="cell-main">
                        {r.is_walk_in ? (
                          <div className="product-cell__name">
                            {r.customer_name}
                          </div>
                        ) : (
                          <Link
                            className="product-cell__name"
                            to={`/customers/${r.customer_id}`}
                          >
                            {r.customer_name}
                          </Link>
                        )}
                        {r.phone && (
                          <div className="product-cell__sub">{r.phone}</div>
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
                      <td className="num" data-label="Net spent">
                        {money(r.net_spent, symbol)}
                      </td>
                      <td data-label="Last purchase">
                        {r.last_purchase_at
                          ? formatDate(r.last_purchase_at)
                          : r.is_walk_in
                            ? "—"
                            : "Never"}
                      </td>
                      <td className="num" data-label="Balance">
                        {r.is_walk_in ? (
                          "—"
                        ) : (
                          <Balance value={r.balance} symbol={symbol} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="rp-total-row">
                    <td className="cell-main">
                      All matching customers ({whole(data.total)})
                    </td>
                    <td className="num" data-label="Orders">
                      {whole(t.orders)}
                    </td>
                    <td className="num" data-label="Gross sales">
                      {money(t.gross, symbol)}
                    </td>
                    <td className="num" data-label="Refunds">
                      {money(t.refunds, symbol)}
                    </td>
                    <td className="num" data-label="Net spent">
                      {money(t.net, symbol)}
                    </td>
                    <td />
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
