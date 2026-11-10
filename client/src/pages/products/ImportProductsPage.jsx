import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileDown, Upload } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import Pagination from "../../components/ui/Pagination";
import ExportButton from "../../components/reports/ExportButton";
import { Strip } from "../../components/reports/ReportParts";
import { whole } from "../../lib/reportFormat";
import { useAuth } from "../../context/AuthContext";
import { PAGE_SIZE } from "../../data/products";
import {
  importProducts,
  listImportJobs,
  makeProductExportFetcher,
  validateProductImport,
} from "../../data/imports";
import { downloadCsv, toCsv } from "../../lib/csv";
import { todayInLagos } from "../../lib/analytics";
import { formatDateTime } from "../../lib/format";
import {
  MAX_FILE_BYTES,
  parseProductFile,
  productExportColumns,
  templateCsv,
} from "../../lib/productImport";
import "../../styles/reports.css";

const ACTION_LABEL = {
  create: "New product",
  update: "Update",
  unchanged: "No change",
  error: "Error",
};
const ACTION_BADGE = {
  create: "badge badge--success",
  update: "badge badge--warning",
  unchanged: "badge",
  error: "badge badge--danger",
};

export default function ImportProductsPage() {
  const { business, can } = useAuth();
  const businessId = business.id;
  const canSeeCost = can("finance.view");

  const [stage, setStage] = useState("pick"); // pick | checking | preview | importing | done
  const [file, setFile] = useState(null); // { name, rows, ignored }
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [inputKey, setInputKey] = useState(0);
  const [jobs, setJobs] = useState({ rows: [], error: "" });
  const [jobsReload, setJobsReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listImportJobs(businessId).then((res) => {
      if (!cancelled) setJobs(res);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, jobsReload]);

  const exportFetcher = useMemo(
    () => makeProductExportFetcher(businessId),
    [businessId],
  );
  const exportColumns = useMemo(
    () => productExportColumns(canSeeCost),
    [canSeeCost],
  );

  function reset() {
    setStage("pick");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setSkipInvalid(false);
    setFilter("all");
    setPage(1);
    setInputKey((n) => n + 1);
  }

  async function onFile(e) {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    setError("");
    setPreview(null);
    setResult(null);
    setSkipInvalid(false);
    setFilter("all");
    setPage(1);

    if (chosen.size > MAX_FILE_BYTES) {
      setFile(null);
      setStage("pick");
      setError("That file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    const text = await chosen.text();
    const parsed = parseProductFile(text);
    if (parsed.error) {
      setFile(null);
      setStage("pick");
      setError(parsed.error);
      return;
    }
    setFile({ name: chosen.name, rows: parsed.rows, ignored: parsed.ignored });
    setStage("checking");
    const res = await validateProductImport({ businessId, rows: parsed.rows });
    if (res.error) {
      setStage("pick");
      setError(res.error);
      return;
    }
    setPreview(res.data);
    setStage("preview");
  }

  async function runImport() {
    setError("");
    setStage("importing");
    const res = await importProducts({
      businessId,
      fileName: file.name,
      rows: file.rows,
      skipInvalid,
    });
    if (res.error) {
      setStage("preview");
      setError(res.error);
      return;
    }
    setResult(res.data);
    setStage("done");
    setJobsReload((n) => n + 1);
  }

  const counts = preview?.counts;
  const changes = counts ? counts.create + counts.update : 0;
  const hasErrors = Boolean(counts) && counts.error > 0;
  const canRun =
    stage === "preview" && changes > 0 && (!hasErrors || skipInvalid);

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    if (filter === "errors")
      return preview.rows.filter((r) => r.action === "error");
    if (filter === "changes")
      return preview.rows.filter(
        (r) => r.action === "create" || r.action === "update",
      );
    return preview.rows;
  }, [preview, filter]);
  const pageRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function downloadErrors() {
    const bad = preview.rows.filter((r) => r.action === "error");
    downloadCsv(
      `ledgerly-import-errors-${todayInLagos()}.csv`,
      toCsv(
        [
          { header: "Row in your file", value: (r) => r.row + 1 },
          { header: "Product", value: (r) => r.name },
          { header: "SKU", value: (r) => r.sku },
          { header: "Problem", value: (r) => r.message },
        ],
        bad,
      ),
    );
  }

  return (
    <>
      <PageHeader
        title="Import products"
        subtitle="Add or update many products at once from a CSV file"
      />

      {error && (
        <div className="alert alert--danger" role="alert">
          {error}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => setError("")}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="card rp-card">
        <header>
          <h2 className="card__title">1. Get your file ready</h2>
          <p className="card__sub">
            Start from the template, or download your current products, change
            them in Excel and upload the file again. Save as{" "}
            <strong>CSV UTF-8</strong>.
          </p>
        </header>
        <div className="rp-actions-row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() =>
              downloadCsv("ledgerly-products-template.csv", templateCsv())
            }
          >
            <FileDown size={16} aria-hidden="true" /> Download template
          </button>
          <ExportButton
            label="Download current products"
            filename={`ledgerly-products-${todayInLagos()}.csv`}
            columns={exportColumns}
            fetchPage={exportFetcher}
          />
        </div>
        <ul className="rp-list rp-muted">
          <li>
            <strong>name</strong> is the only required column. Up to 2,000
            products per file.
          </li>
          <li>
            Products are matched by <strong>sku</strong> (capital letters do not
            matter). A match is updated; a new sku creates a product. A row
            without a sku always creates a new product.
          </li>
          <li>
            A blank cell leaves the existing value unchanged.{" "}
            <strong>category</strong> and <strong>supplier</strong> are matched
            by name and created if they do not exist.
          </li>
          <li>
            <strong>opening_stock</strong> only applies to new products. To
            change the stock of an existing product, use a stock adjustment in
            Inventory.
          </li>
        </ul>
      </section>

      <section className="card rp-card">
        <header>
          <h2 className="card__title">2. Choose your file</h2>
          <p className="card__sub">
            Nothing is saved until you confirm in the next step.
          </p>
        </header>
        <Field
          key={inputKey}
          label="CSV file"
          type="file"
          accept=".csv,.txt,text/csv"
          onChange={onFile}
          disabled={stage === "checking" || stage === "importing"}
        />
        {stage === "checking" && (
          <p className="rp-muted" role="status">
            Checking {file?.name}…
          </p>
        )}
      </section>

      {preview && (stage === "preview" || stage === "importing") && (
        <section className="card rp-card" aria-busy={stage === "importing"}>
          <header>
            <h2 className="card__title">3. Check and import</h2>
            <p className="card__sub">
              {file.name} · {whole(preview.total_rows)}{" "}
              {preview.total_rows === 1 ? "row" : "rows"} (row numbers match
              your spreadsheet)
            </p>
          </header>

          <Strip
            items={[
              { label: "New products", value: whole(counts.create) },
              { label: "Updates", value: whole(counts.update) },
              { label: "No change", value: whole(counts.unchanged) },
              { label: "Rows with errors", value: whole(counts.error) },
            ]}
          />

          {file.ignored.length > 0 && (
            <p className="info-note">
              These columns are not used and were ignored:{" "}
              {file.ignored.join(", ")}.
            </p>
          )}
          {(preview.new_categories.length > 0 ||
            preview.new_suppliers.length > 0) && (
            <p className="info-note">
              {preview.new_categories.length > 0 &&
                `New categories that will be created: ${preview.new_categories.join(", ")}. `}
              {preview.new_suppliers.length > 0 &&
                `New suppliers that will be created: ${preview.new_suppliers.join(", ")}.`}
            </p>
          )}
          {preview.opening_stock_rows > 0 && (
            <p className="info-note">
              {whole(preview.opening_stock_rows)} new{" "}
              {preview.opening_stock_rows === 1
                ? "product has"
                : "products have"}{" "}
              opening stock. It is recorded as a stock movement.
            </p>
          )}

          <div className="rp-controls">
            <div className="rp-controls__grid">
              <Field
                as="select"
                label="Show rows"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All rows</option>
                <option value="changes">Only changes (new and updates)</option>
                <option value="errors">Only rows with errors</option>
              </Field>
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="empty">
              <h3 className="card__title">No rows to show</h3>
              <p className="card__sub">Try another filter.</p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>What happens</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr
                        key={r.row}
                        className={r.action === "error" ? "" : ""}
                      >
                        <td className="cell-main">{r.row + 1}</td>
                        <td className="cell-wrap" data-label="Product">
                          {r.name || "—"}
                        </td>
                        <td className="cell-wrap" data-label="SKU">
                          {r.sku || "—"}
                        </td>
                        <td data-label="What happens">
                          <span className={ACTION_BADGE[r.action]}>
                            {ACTION_LABEL[r.action]}
                          </span>
                        </td>
                        <td className="cell-wrap" data-label="Note">
                          {r.message || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                total={visibleRows.length}
                onPage={setPage}
              />
            </>
          )}

          {hasErrors && (
            <div className="stack">
              <div className="alert alert--danger" role="alert">
                {whole(counts.error)}{" "}
                {counts.error === 1 ? "row has" : "rows have"} errors. Fix your
                file and choose it again, or import only the valid rows.
              </div>
              <div className="rp-actions-row">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={downloadErrors}
                >
                  <FileDown size={16} aria-hidden="true" /> Download the rows
                  with errors
                </button>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={skipInvalid}
                  onChange={(e) => setSkipInvalid(e.target.checked)}
                />
                Import only the valid rows and skip the {whole(counts.error)}{" "}
                with errors
              </label>
            </div>
          )}

          {changes === 0 && !hasErrors && (
            <p className="info-note">
              Everything in this file is already up to date. There is nothing to
              import.
            </p>
          )}

          <div className="rp-actions-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canRun || stage === "importing"}
              onClick={runImport}
            >
              <Upload size={16} aria-hidden="true" />{" "}
              {stage === "importing"
                ? "Importing…"
                : `Import ${whole(changes)} ${changes === 1 ? "product" : "products"}`}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={stage === "importing"}
              onClick={reset}
            >
              Start over
            </button>
          </div>
        </section>
      )}

      {stage === "done" && result && (
        <section className="card rp-card">
          <div className="alert alert--success" role="status">
            Import finished: {whole(result.created)} new,{" "}
            {whole(result.updated)} updated, {whole(result.unchanged)} unchanged
            {result.skipped_errors > 0
              ? `, ${whole(result.skipped_errors)} skipped because of errors`
              : ""}
            .
          </div>
          <Strip
            items={[
              { label: "New products", value: whole(result.created) },
              { label: "Updated", value: whole(result.updated) },
              {
                label: "Opening stock entries",
                value: whole(result.stock_entries),
              },
              {
                label: "New categories / suppliers",
                value: `${whole(result.new_categories)} / ${whole(result.new_suppliers)}`,
              },
            ]}
          />
          <div className="rp-actions-row">
            <Link to="/products" className="btn btn--primary">
              View products
            </Link>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={reset}
            >
              Import another file
            </button>
          </div>
        </section>
      )}

      <section className="card rp-card">
        <header>
          <h2 className="card__title">Recent imports</h2>
          <p className="card__sub">
            The last few files imported into this business.
          </p>
        </header>
        {jobs.error ? (
          <div className="alert alert--danger" role="alert">
            Could not load recent imports: {jobs.error}
          </div>
        ) : jobs.rows.length === 0 ? (
          <div className="empty">
            <p className="card__sub">No imports yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>File</th>
                  <th>When</th>
                  <th className="num">Rows</th>
                  <th className="num">Imported</th>
                  <th className="num">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {jobs.rows.map((j) => (
                  <tr key={j.id}>
                    <td className="cell-main cell-wrap">
                      {j.file_name || "Untitled file"}
                    </td>
                    <td data-label="When">{formatDateTime(j.created_at)}</td>
                    <td className="num" data-label="Rows">
                      {j.total_rows}
                    </td>
                    <td className="num" data-label="Imported">
                      {j.succeeded_rows}
                    </td>
                    <td className="num" data-label="Skipped">
                      {j.failed_rows}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
