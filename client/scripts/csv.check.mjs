import assert from "node:assert/strict";
import {
  csvCell,
  csvDate,
  csvDateTime,
  csvMoney,
  parseCsv,
  toCsv,
} from "../src/lib/csv.js";

assert.equal(csvCell("plain"), "plain");
assert.equal(csvCell('a,"b"'), '"a,""b"""');
assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
assert.equal(csvCell("=1+1"), "'=1+1");
assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
assert.equal(csvCell("-5.00"), "-5.00");
assert.equal(csvCell("+2348012345678"), "+2348012345678");
assert.equal(csvCell("+1-1"), "'+1-1");
assert.equal(csvCell(null), "");
assert.equal(csvCell(12.5), "12.5");
assert.equal(csvCell(" padded"), '" padded"');
assert.equal(csvMoney(1250.5), "1250.50");
assert.equal(csvMoney("0.1"), "0.10");
assert.equal(csvMoney(null), "");
assert.equal(csvDateTime("2020-03-10T11:00:00Z"), "2020-03-10 12:00");
assert.equal(csvDate("2020-03-10"), "2020-03-10");
assert.equal(csvDate("2020-03-10T23:30:00Z"), "2020-03-11"); // 00:30 the next day in Lagos

const csv = toCsv(
  [
    { header: "Name", value: (r) => r.n },
    { header: "Amount (₦)", value: (r) => csvMoney(r.a) },
  ],
  [
    { n: "Ada, Ltd", a: 1250.5 },
    { n: 'Say "hi"', a: -3 },
  ],
);
assert.equal(csv.charCodeAt(0), 0xfeff);
assert.ok(csv.includes("\r\n"));
assert.deepEqual(parseCsv(csv).rows, [
  ["Name", "Amount (₦)"],
  ["Ada, Ltd", "1250.50"],
  ['Say "hi"', "-3.00"],
]);

const semi = parseCsv('\uFEFFname;price\r\n"Tote\nbag";1500\r\n');
assert.equal(semi.delimiter, ";");
assert.deepEqual(semi.rows, [
  ["name", "price"],
  ["Tote\nbag", "1500"],
]);

assert.deepEqual(parseCsv("a,b\n\n1,2").rows, [
  ["a", "b"],
  ["1", "2"],
]);
assert.ok(parseCsv('a,"b').error);

console.log("csv.js OK");
