// CSV helpers: build, parse and download. No imports, so it also runs in Node for the checks.

const BOM = "\uFEFF"; // makes Excel read the file as UTF-8, so the naira sign shows correctly
const NUMERIC = /^[+-]?\d+(\.\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

// One cell. Text that a spreadsheet could run as a formula (=, +, -, @) gets a leading
// apostrophe, but real numbers (including negatives) are left alone.
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  let text = String(value);
  if (text !== "" && FORMULA_START.test(text) && !NUMERIC.test(text))
    text = `'${text}`;
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// columns: [{ header, value: (row) => cell }]. UTF-8 with a BOM and CRLF line endings.
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  }
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

// Money as a plain number with two decimals: "1250.50". No symbol, so Excel can add it up.
export function csvMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

// Quantities: a plain number, at most 3 decimals, no trailing zeros.
export function csvNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(3)) : "";
}

// Dates are written in Lagos time, like the rest of the app: 2026-11-08 14:05
const LAGOS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function lagosParts(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Object.fromEntries(
    LAGOS.formatToParts(d).map((p) => [p.type, p.value]),
  );
}

export function csvDateTime(iso) {
  if (!iso) return "";
  const p = lagosParts(iso);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` : "";
}

// A plain date column ("2026-03-10") is kept as it is; a timestamp becomes its Lagos date.
export function csvDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const p = lagosParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

export function safeFileName(name) {
  return String(name || "export.csv").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Comma, semicolon or tab: whichever appears most on the first line outside quotes.
function detectDelimiter(text) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === "\n" || ch === "\r") break;
      if (ch in counts) counts[ch] += 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

// Returns { rows: string[][], delimiter, error }. Handles quotes, doubled quotes
export function parseCsv(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = detectDelimiter(text);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i += 1;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (inQuotes) {
    return {
      rows: [],
      delimiter,
      error: 'The file has a quote (") that is never closed.',
    };
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return {
    rows: rows.filter((r) => r.some((c) => c.trim() !== "")),
    delimiter,
    error: "",
  };
}
