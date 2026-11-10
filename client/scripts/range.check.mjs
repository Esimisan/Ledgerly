import assert from "node:assert/strict";
import {
  inclusiveDays,
  presetRange,
  resolveRange,
  toApiRange,
} from "../src/lib/reportRange.js";

const today = "2026-11-09";
assert.deepEqual(presetRange("this_month", today), {
  from: "2026-11-01",
  to: "2026-11-09",
});
assert.deepEqual(presetRange("last_month", today), {
  from: "2026-10-01",
  to: "2026-10-31",
});
assert.deepEqual(presetRange("last_30", today), {
  from: "2026-10-11",
  to: "2026-11-09",
});
assert.deepEqual(presetRange("this_quarter", today), {
  from: "2026-10-01",
  to: "2026-11-09",
});
assert.deepEqual(presetRange("ytd", today), {
  from: "2026-01-01",
  to: "2026-11-09",
});
assert.deepEqual(presetRange("last_month", "2026-01-15"), {
  from: "2025-12-01",
  to: "2025-12-31",
});
assert.deepEqual(presetRange("this_quarter", "2026-02-10"), {
  from: "2026-01-01",
  to: "2026-02-10",
});

assert.equal(inclusiveDays("2026-11-01", "2026-11-30"), 30);
assert.equal(inclusiveDays("2026-11-05", "2026-11-05"), 1);

// the single conversion to the database's exclusive end
assert.deepEqual(toApiRange("2026-11-01", "2026-11-30"), {
  apiFrom: "2026-11-01",
  apiTo: "2026-12-01",
});
assert.deepEqual(toApiRange("2026-12-31", "2026-12-31"), {
  apiFrom: "2026-12-31",
  apiTo: "2027-01-01",
});

assert.equal(
  resolveRange(
    { preset: "custom", from: "2026-11-05", to: "2026-11-01" },
    today,
  ).valid,
  false,
);
assert.equal(
  resolveRange(
    { preset: "custom", from: "2020-01-01", to: "2024-01-01" },
    today,
  ).valid,
  false,
);
assert.equal(
  resolveRange(
    { preset: "custom", from: "2026-02-30", to: "2026-03-01" },
    today,
  ).valid,
  false,
);
assert.equal(
  resolveRange(
    { preset: "custom", from: "2026-11-01", to: "2026-11-30" },
    today,
  ).valid,
  true,
);
assert.equal(resolveRange({ preset: "nonsense" }, today).preset, "this_month");

console.log("reportRange.js OK");
