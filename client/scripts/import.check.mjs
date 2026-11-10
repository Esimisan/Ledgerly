import assert from "node:assert/strict";
import { parseProductFile, templateCsv } from "../src/lib/productImport.js";
import { parseCsv } from "../src/lib/csv.js";

// the template parses back into its own two sample products
const t = parseProductFile(templateCsv());
assert.equal(t.error, undefined);
assert.equal(t.rows.length, 2);
assert.equal(t.rows[0].name, "Cotton T-shirt");
assert.equal(t.rows[0].sku, "TS-001");
assert.equal(t.rows[1].supplier, "");

// friendly headers, semicolons, extra columns, quoted comma
const csv =
  'Product Name;Item Code;Cost;Price;Stock;Colour\r\n"Soap, bar";S-1;"1,200";2000;5;Blue\r\n';
const p = parseProductFile(csv);
assert.deepEqual(p.ignored, ["Colour"]);
assert.deepEqual(p.rows[0], {
  name: "Soap, bar",
  sku: "S-1",
  cost_price: "1,200",
  selling_price: "2000",
  opening_stock: "5",
});

// a file with no name column
assert.match(parseProductFile("sku,price\r\nA,1\r\n").error, /"name" column/);
// header only
assert.match(
  parseProductFile("name,sku\r\n").error,
  /at least one product row/,
);
// over the row limit
const big = ["name", ...Array.from({ length: 2001 }, (_, i) => `P${i}`)].join(
  "\n",
);
assert.match(parseProductFile(big).error, /at most 2,000/);
// unclosed quote
assert.ok(parseProductFile('name\r\n"oops').error);
// first of two columns mapping to the same field wins
assert.deepEqual(
  parseProductFile("name,cost,cost price\r\nA,1,2\r\n").rows[0],
  { name: "A", cost_price: "1" },
);
assert.equal(parseCsv("x").rows.length, 1);

console.log("productImport.js OK");
