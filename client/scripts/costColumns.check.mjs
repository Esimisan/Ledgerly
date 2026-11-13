import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const TABLES = "products|sales|sale_items|stock_movements";
const COST = /\b(cost_price|cost_total|unit_cost)\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const errors = [];
const reads = [];

for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replaceAll("\\", "/");

  const re = new RegExp(
    `\\.from\\(\\s*["'](${TABLES})["']\\s*\\)([\\s\\S]{0,400}?)\\.select\\(\\s*(["'\`])([\\s\\S]*?)\\3`,
    "g",
  );
  for (const m of text.matchAll(re)) {
    const cols = m[4];
    if (cols.trim() === "*" || COST.test(cols))
      errors.push(
        `${rel}:${lineOf(text, m.index)}  .from("${m[1]}").select(${JSON.stringify(cols.slice(0, 60))}) reads a cost column`,
      );
  }

  const dyn = /\.from\(\s*table\s*\)([\s\S]{0,300}?)\.select\(\s*(["'`])\*\2/g;
  for (const m of text.matchAll(dyn))
    errors.push(
      `${rel}:${lineOf(text, m.index)}  .from(table).select("*") is dynamic: it must name its columns`,
    );

  text.split("\n").forEach((line, i) => {
    if (COST.test(line) && !/^\s*(\/\/|\*)/.test(line))
      reads.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
  });
}

console.log(
  errors.length
    ? "PROBLEMS (queries that fail or leak cost):"
    : "No cost-column queries found.",
);
for (const e of errors) console.log("  " + e);
console.log(
  `\nREVIEW (every line that mentions a cost field; each must read from a view, an RPC, or sit behind can("finance.view")): ${reads.length}`,
);
for (const r of reads) console.log("  " + r);
process.exit(errors.length ? 1 : 0);
