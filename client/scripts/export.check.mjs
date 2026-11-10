import assert from "node:assert/strict";
import { collectRows } from "../src/lib/exportRows.js";

// 2,500 rows -> three pages of 1,000 / 1,000 / 500
const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
const pages = [];
const fetchPage = async (page, size) => {
  pages.push(page);
  return {
    rows: all.slice((page - 1) * size, page * size),
    total: all.length,
    error: "",
  };
};
let progress = 0;
const ok = await collectRows(fetchPage, {
  onProgress: (done) => (progress = done),
});
assert.equal(ok.rows.length, 2500);
assert.deepEqual(pages, [1, 2, 3]);
assert.equal(progress, 2500);
assert.equal(ok.rows[2499].id, 2499);

// exactly one full page: stops without asking for page 2
const one = [];
const exact = await collectRows(async (page, size) => {
  one.push(page);
  return {
    rows: Array.from({ length: size }, (_, i) => ({ i })),
    total: size,
    error: "",
  };
});
assert.equal(exact.rows.length, 1000);
assert.deepEqual(one, [1]);

// over the limit: refuses after the first page
const big = await collectRows(async () => ({
  rows: [],
  total: 50001,
  error: "",
}));
assert.match(big.error, /50,000-row limit/);

// an error from the server stops the export
const failed = await collectRows(async () => ({
  rows: [],
  total: 0,
  error: "boom",
}));
assert.equal(failed.error, "boom");

// cancel between pages
let calls = 0;
const stopped = await collectRows(
  async (page, size) => {
    calls += 1;
    return {
      rows: Array.from({ length: size }, () => ({})),
      total: 5000,
      error: "",
    };
  },
  { isCancelled: () => calls >= 1 },
);
assert.equal(stopped.cancelled, true);
assert.equal(stopped.rows.length, 0);

console.log("exportRows.js OK");
