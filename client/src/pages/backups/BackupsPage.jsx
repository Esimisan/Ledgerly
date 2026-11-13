import { useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import ExportButton from "../../components/reports/ExportButton";
import { ReportCard, ReportState } from "../../components/reports/ReportParts";
import { useAuth } from "../../context/AuthContext";
import { useRpcQuery } from "../../hooks/useRpcQuery";
import { createBackup, listBackups } from "../../data/backups";
import {
  CUSTOMER_COLUMNS,
  EXPENSE_COLUMNS,
  productColumns,
  saleColumns,
  customersSource,
  expensesSource,
  productsSource,
  salesSource,
} from "../../data/dataExport";
import { downloadJson } from "../../lib/downloadJson";
import { formatDateTime, humanize } from "../../lib/format";
import "../../styles/settings.css";

const sumCounts = (counts) =>
  Object.values(counts ?? {}).reduce((a, n) => a + Number(n || 0), 0);

function formatSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1048576) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function statusClass(status) {
  if (/^complet|done|success|succeeded/i.test(status)) return "badge--success";
  if (/fail|error/i.test(status)) return "badge--danger";
  return "badge--warning";
}

export default function BackupsPage() {
  const { business, can } = useAuth();
  const history = useRpcQuery(() => listBackups(business.id), [business.id]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [stamp] = useState(() => new Date().toISOString().slice(0, 10));
  const rows = history.data ?? [];

  const downloads = useMemo(
    () => [
      {
        key: "products",
        name: "Products",
        text: "Name, SKU, category, supplier, prices, stock level and status.",
        columns: productColumns(can("finance.view")),
        fetchPage: productsSource(business.id, {
          withCost: can("finance.view"),
        }),
      },
      {
        key: "customers",
        name: "Customers",
        text: "Contact details, discount, balance, orders and total spent.",
        columns: CUSTOMER_COLUMNS,
        fetchPage: customersSource(business.id),
      },
      {
        key: "sales",
        name: "Sales",
        text: "Every sale with its customer, totals, payment and any void.",
        columns: saleColumns(can("finance.view")),
        fetchPage: salesSource(business.id, { withCost: can("finance.view") }),
      },
      {
        key: "expenses",
        name: "Expenses",
        text: "Every expense with its category, amount and any void.",
        columns: EXPENSE_COLUMNS,
        fetchPage: expensesSource(business.id),
      },
    ],
    [business.id, can],
  );

  async function run() {
    setRunning(true);
    setError("");
    setDone("");
    const { data, error: err } = await createBackup(business.id);
    if (err) {
      setRunning(false);
      setError(err);
      return;
    }
    const slug =
      business.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "business";
    downloadJson(`ledgerly-backup-${slug}-${stamp}.json`, data);
    setDone(
      `Backup file downloaded: ${sumCounts(data.row_counts).toLocaleString("en")} records.`,
    );
    setRunning(false);
    history.reload();
  }

  return (
    <div className="stack">
      <PageHeader
        title="Backups and exports"
        subtitle="Keep your data safe, or open it in Excel."
      />

      <ReportCard
        title="Download your data for Excel"
        subtitle="Each button saves one spreadsheet file on this device."
      >
        <p>
          Double-click a downloaded file to open it in Excel or Google Sheets.
          Use these for your own records, your accountant, or your own analysis.
        </p>
        <ul className="se-exports">
          {downloads.map((d) => (
            <li className="se-export" key={d.key}>
              <div className="se-export__text">
                <div className="se-export__name">{d.name}</div>
                <p className="se-hint">{d.text}</p>
              </div>
              <ExportButton
                label="Download"
                filename={`${d.key}-${stamp}.csv`}
                columns={d.columns}
                fetchPage={d.fetchPage}
              />
            </li>
          ))}
        </ul>
      </ReportCard>

      <ReportCard
        title="Full backup file"
        subtitle="A complete copy of everything, for safekeeping."
      >
        <p>
          This one file holds all your business records in one place: products,
          stock, sales, customers, expenses, purchases, staff and settings. It
          is not made to be read by people, so you will not be able to open it
          in Excel. Keep it somewhere safe, such as a drive that is not this
          computer.
        </p>
        <p className="info-note">
          If something ever goes wrong, a developer can use this file to bring
          your data back. Restoring from it is not available in the app yet. It
          does not include pictures, receipts, logos or sign-in accounts.
        </p>
        {error && (
          <p className="alert alert--danger" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="alert alert--success" role="status">
            {done}
          </p>
        )}
        <div className="se-actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={run}
            disabled={running}
          >
            {running ? "Preparing backup…" : "Create and download backup file"}
          </button>
        </div>
      </ReportCard>

      <ReportCard
        title="Backup file history"
        subtitle="The last 20 backup files. Only the record of each one is kept here, not the file."
      >
        <ReportState
          loading={history.loading && !history.data}
          error={history.data ? "" : history.error}
          onRetry={history.reload}
          empty={!history.loading && rows.length === 0}
          emptyTitle="No backup files yet"
          emptyText="Create your first backup file above. It will be listed here."
        >
          <div className="table-wrap">
            <table className="table table--stack se-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>By</th>
                  <th>Records</th>
                  <th>Size</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td data-label="When" className="se-nowrap">
                      {formatDateTime(b.created_at)}
                    </td>
                    <td data-label="By">{b.by}</td>
                    <td data-label="Records" className="se-nowrap">
                      {sumCounts(b.row_counts).toLocaleString("en")}
                    </td>
                    <td data-label="Size" className="se-nowrap">
                      {formatSize(b.size_bytes)}
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${statusClass(b.status)}`}>
                        {humanize(b.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportState>
      </ReportCard>
    </div>
  );
}
