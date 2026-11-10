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
  Strip,
} from "./ReportParts";
import { money, whole } from "../../lib/reportFormat";
import { useListParams } from "../../hooks/useListParams";
import { useAnalyticsQuery } from "../../lib/analytics";
import { csvDate, csvMoney } from "../../lib/csv";
import { formatDate } from "../../lib/format";
import {
  BALANCE_SORTS,
  listCustomerBalances,
  toPage,
} from "../../data/reports";

const STATUSES = ["owing", "credit", "all"];
const DEFAULT_SORT = "balance:desc";
const KEYS = {
  name: [
    { key: "name:asc", dir: "asc" },
    { key: "name:desc", dir: "desc" },
  ],
  balance: [
    { key: "balance:desc", dir: "desc" },
    { key: "balance:asc", dir: "asc" },
  ],
  last: [
    { key: "last_purchase:desc", dir: "desc" },
    { key: "last_purchase:asc", dir: "asc" },
  ],
};

export default function CustomerBalancesPanel({
  businessId,
  businessName,
  symbol,
}) {
  const { params, update } = useListParams();
  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = STATUSES.includes(rawStatus) ? rawStatus : "owing";
  const rawSort = params.get("sort");
  const sort = BALANCE_SORTS[rawSort] ? rawSort : DEFAULT_SORT;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const { data, loading, error, reload } = useAnalyticsQuery(
    () => listCustomerBalances({ businessId, status, search: q, sort, page }),
    [businessId, status, q, sort, page],
  );

  const changeSort = (key) =>
    update({ sort: !key || key === DEFAULT_SORT ? "" : key });
  const t = data?.totals;

  const columns = useMemo(
    () => [
      { header: "Customer", value: (r) => r.customer_name },
      { header: "Phone", value: (r) => r.phone },
      {
        header: `Balance (${symbol}, positive = owes)`,
        value: (r) => csvMoney(r.balance),
      },
      { header: "Last purchase", value: (r) => csvDate(r.last_purchase_at) },
      { header: "Last payment", value: (r) => csvDate(r.last_payment_at) },
      { header: "Status", value: (r) => (r.is_active ? "Active" : "Inactive") },
    ],
    [symbol],
  );

  const fetchExportPage = (pg, pageSize) =>
    listCustomerBalances({
      businessId,
      status,
      search: q,
      sort,
      page: pg,
      pageSize,
    }).then(toPage);

  const subtitle =
    "A snapshot as of now. It does not depend on the date range.";

  return (
    <ReportCard
      title="Customer balances"
      subtitle={subtitle}
      actions={
        <>
          <ExportButton
            filename={`ledgerly-customer-balances-${new Date().toISOString().slice(0, 10)}.csv`}
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
        title="Customer balances"
        rangeText="As of now"
      />

      <SearchBox
        value={q}
        onChange={(v) => update({ q: v })}
        label="Search customers"
        placeholder="Search name, phone or email"
      />
      <div className="rp-controls rp-noprint">
        <div className="rp-controls__grid">
          <Field
            as="select"
            label="Show"
            value={status}
            onChange={(e) =>
              update({
                status: e.target.value === "owing" ? "" : e.target.value,
              })
            }
          >
            <option value="owing">Customers who owe money</option>
            <option value="credit">Customers with store credit</option>
            <option value="all">Everyone with a balance</option>
          </Field>
          <Field
            as="select"
            label="Sort by"
            value={sort}
            onChange={(e) => changeSort(e.target.value)}
          >
            {Object.entries(BALANCE_SORTS).map(([key, s]) => (
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
          q ? "No customers match your search" : "No balances to show"
        }
        emptyText={
          q
            ? "Try a different search."
            : status === "credit"
              ? "No customer holds store credit right now."
              : "Nobody owes you money right now."
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
            <Strip
              items={[
                { label: "Customers listed", value: whole(data.total) },
                { label: "Total owed to you", value: money(t.owed, symbol) },
                { label: "Store credit held", value: money(t.credit, symbol) },
              ]}
            />
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
                    <th>Phone</th>
                    <SortHeader
                      label="Balance"
                      className="num"
                      keys={KEYS.balance}
                      current={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      label="Last purchase"
                      keys={KEYS.last}
                      current={sort}
                      onSort={changeSort}
                    />
                    <th>Last payment</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const n = Number(r.balance);
                    return (
                      <tr
                        key={r.customer_id}
                        className={r.is_active ? "" : "is-inactive"}
                      >
                        <td className="cell-main">
                          <Link
                            className="product-cell__name"
                            to={`/customers/${r.customer_id}`}
                          >
                            {r.customer_name}
                          </Link>
                          {!r.is_active && (
                            <div className="product-cell__sub">Inactive</div>
                          )}
                        </td>
                        <td data-label="Phone">{r.phone || "—"}</td>
                        <td className="num" data-label="Balance">
                          {n > 0 ? (
                            <span className="balance--owes">
                              Owes {money(n, symbol)}
                            </span>
                          ) : (
                            <span className="balance--credit">
                              Credit {money(Math.abs(n), symbol)}
                            </span>
                          )}
                        </td>
                        <td data-label="Last purchase">
                          {r.last_purchase_at
                            ? formatDate(r.last_purchase_at)
                            : "Never"}
                        </td>
                        <td data-label="Last payment">
                          {r.last_payment_at
                            ? formatDate(r.last_payment_at)
                            : "—"}
                        </td>
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
