import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

// Public tables that carry business_id.
const BUSINESS_TABLES = new Set([
  "audit_log",
  "backups",
  "business_members",
  "categories",
  "customer_transactions",
  "customers",
  "discounts",
  "document_counters",
  "expense_categories",
  "expenses",
  "import_jobs",
  "invitations",
  "products",
  "purchase_order_items",
  "purchase_orders",
  "purchase_receipt_items",
  "purchase_receipts",
  "role_permissions",
  "sale_items",
  "sale_payments",
  "sale_return_items",
  "sale_returns",
  "sales",
  "stock_movements",
  "suppliers",
]);
// Functions that legitimately take no business id (per user, or token based).
const NO_BUSINESS_RPC = new Set([
  "my_businesses",
  "create_business",
  "accept_invitation",
  "get_invitation_preview",
  "my_membership_state",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// From the match to the next ";" (at most 1500 characters): the rest of that call chain.
function statementAt(text, index) {
  const end = text.indexOf(";", index);
  const stop = end === -1 ? text.length : end;
  return text.slice(index, Math.min(stop, index + 1500));
}

const FROM = /\.from\(\s*(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$.]*))\s*\)/g;
const RPC = /\.rpc\(\s*(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$.]*))/g;
const MENTIONS_BUSINESS = /business_id|p_business_id/;
const FILTERS_BY_ID = /\.eq\(\s*["'`]id["'`]/;

const suspects = [];
const moduleState = [];
const storage = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const rel = relative(SRC, file).replaceAll("\\", "/");

  for (const m of text.matchAll(FROM)) {
    const before = text
      .slice(Math.max(0, m.index - 40), m.index)
      .replace(/\s+/g, "");
    if (before.endsWith("storage")) continue; // Storage buckets, not tables
    const literal = m[2];
    const dynamic = m[3];
    const stmt = statementAt(text, m.index);
    let bad = false;
    let why = "";
    if (literal === "businesses") {
      bad = !FILTERS_BY_ID.test(stmt);
      why = 'businesses read without .eq("id", ...)';
    } else if (literal && BUSINESS_TABLES.has(literal)) {
      bad = !MENTIONS_BUSINESS.test(stmt);
      why = `${literal}: no business_id nearby`;
    } else if (dynamic) {
      bad = !MENTIONS_BUSINESS.test(stmt);
      why = `dynamic table (${dynamic}): no business_id nearby`;
    }
    if (bad) suspects.push(`${rel}:${lineOf(text, m.index)}  ${why}`);
  }

  for (const m of text.matchAll(RPC)) {
    const literal = m[2];
    const dynamic = m[3];
    if (literal && NO_BUSINESS_RPC.has(literal)) continue;
    const stmt = statementAt(text, m.index);
    if (!MENTIONS_BUSINESS.test(stmt)) {
      suspects.push(
        `${rel}:${lineOf(text, m.index)}  rpc ${literal ?? `(dynamic: ${dynamic})`}: no p_business_id nearby`,
      );
    }
  }

  text.split("\n").forEach((line, i) => {
    if (
      /^(?:let|var)\s+/.test(line) ||
      /^(?:const|let|var)\s+[\w$]+\s*=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\(/.test(
        line,
      )
    )
      moduleState.push(`${rel}:${i + 1}  ${line.trim()}`);
    if (
      /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)/.test(
        line,
      )
    )
      storage.push(`${rel}:${i + 1}  ${line.trim()}`);
  });
}

const show = (title, rows) => {
  console.log(`\n${title} (${rows.length})`);
  for (const r of rows) console.log("  " + r);
};

show(
  "[A] Queries and RPC calls with no business id nearby (review each)",
  suspects,
);
show(
  "[B] Module-level mutable state (must be keyed by business id or cleared on switch)",
  moduleState,
);
show(
  "[C] localStorage / sessionStorage use (keys must not mix businesses)",
  storage,
);

console.log(`
Limits: a heuristic, not a proof. It reads the text from each .from( / .rpc( up to the next ";".
It misses ids passed through helper variables or spread objects, filters added in a later
statement, and it flags dynamic table names. Always read every line in [A].
Business-agnostic tables (profiles, tour_progress) and the RPCs listed at the top are allowed.`);
