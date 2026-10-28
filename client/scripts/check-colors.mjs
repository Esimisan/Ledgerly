import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = "src";
const EXEMPT = ["tokens.css"];
const EXTENSIONS = new Set([".css", ".jsx", ".js"]);
const RAW_COLOUR =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(/;

const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (
      EXTENSIONS.has(extname(path)) &&
      !EXEMPT.some((e) => path.endsWith(e))
    )
      scan(path);
  }
}

function scan(path) {
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("href=")) return; // "#main" style anchors
      if (RAW_COLOUR.test(line))
        problems.push(`${path}:${i + 1}  ${line.trim()}`);
    });
}

walk(ROOT);

if (problems.length) {
  console.error(
    "Hard-coded colours found. Use a token from tokens.css instead:\n",
  );
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("OK: no hard-coded colours outside tokens.css");
