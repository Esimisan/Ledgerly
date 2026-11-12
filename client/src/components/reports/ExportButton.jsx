import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { downloadCsv, toCsv } from "../../lib/csv";
import { collectRows } from "../../lib/exportRows";
import { withBusinessName } from "../../lib/exportName";
import "../../styles/reports.css";

// Give it either `rows` (already loaded: an array or a function returning one) or `fetchPage(page, pageSize)` for server-paged lists. `columns` is [{ header, value(row) }].
export default function ExportButton({
  label = "Export CSV",
  filename,
  columns,
  rows,
  fetchPage,
  disabled = false,
  className = "btn btn--secondary",
}) {
  const { business } = useAuth();
  const [state, setState] = useState({
    running: false,
    done: 0,
    total: null,
    message: "",
    error: "",
  });
  const cancelRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function run() {
    cancelRef.current = false;
    // The file name carries the business that is active at click time.
    const exportName = withBusinessName(filename, business?.name);
    setState({ running: true, done: 0, total: null, message: "", error: "" });

    let result;
    if (rows) {
      result = {
        rows: typeof rows === "function" ? rows() : rows,
        cancelled: false,
        error: "",
      };
    } else {
      result = await collectRows(fetchPage, {
        isCancelled: () => cancelRef.current || !alive.current,
        onProgress: (done, total) => {
          if (alive.current) setState((s) => ({ ...s, done, total }));
        },
      });
    }
    if (!alive.current) return;

    if (result.cancelled) {
      setState({
        running: false,
        done: 0,
        total: null,
        message: "Export cancelled.",
        error: "",
      });
    } else if (result.error) {
      setState({
        running: false,
        done: 0,
        total: null,
        message: "",
        error: result.error,
      });
    } else if (result.rows.length === 0) {
      setState({
        running: false,
        done: 0,
        total: null,
        message: "Nothing to export for these filters.",
        error: "",
      });
    } else {
      downloadCsv(exportName, toCsv(columns, result.rows));
      setState({
        running: false,
        done: 0,
        total: null,
        message: `Exported ${result.rows.length.toLocaleString("en")} ${result.rows.length === 1 ? "row" : "rows"}.`,
        error: "",
      });
    }
  }

  return (
    <span className="export rp-noprint">
      <button
        type="button"
        className={className}
        disabled={disabled || state.running}
        onClick={run}
      >
        <Download size={16} aria-hidden="true" />{" "}
        {state.running ? "Exporting…" : label}
      </button>
      {state.running && (
        <>
          <span className="export__msg" role="status">
            {state.total
              ? `${state.done.toLocaleString("en")} of ${state.total.toLocaleString("en")} rows`
              : "Starting…"}
          </span>
          {!rows && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Cancel
            </button>
          )}
        </>
      )}
      {!state.running && state.error && (
        <span className="export__msg export__msg--error" role="alert">
          {state.error}
        </span>
      )}
      {!state.running && !state.error && state.message && (
        <span className="export__msg" role="status">
          {state.message}
        </span>
      )}
    </span>
  );
}
