import assert from "node:assert/strict";
import {
  canSwitchTo,
  chooseActive,
  readRemembered,
  writeRemembered,
} from "../src/lib/activeBusiness.js";

const m = [
  { businessId: "a", status: "active" },
  { businessId: "b", status: "suspended" },
  { businessId: "c", status: "active" },
];

assert.equal(chooseActive(m, "c").businessId, "c", "remembered active wins");
assert.equal(
  chooseActive(m, "b").businessId,
  "a",
  "remembered suspended is skipped",
);
assert.equal(
  chooseActive(m, "zzz").businessId,
  "a",
  "unknown remembered -> first active",
);
assert.equal(
  chooseActive(m, null).businessId,
  "a",
  "nothing remembered -> first active",
);
assert.equal(
  chooseActive([{ businessId: "b", status: "suspended" }], "b"),
  null,
  "all suspended -> none",
);
assert.equal(chooseActive([], "a"), null, "no memberships -> none");

assert.equal(canSwitchTo(m, "a"), true);
assert.equal(canSwitchTo(m, "b"), false, "suspended cannot be switched to");
assert.equal(canSwitchTo(m, "zzz"), false, "unknown cannot be switched to");

// Storage without localStorage (plain Node) must not throw.
assert.equal(readRemembered("u1"), null);

// With a stub: the key is per user, and the old global key is removed.
const store = new Map([["ledgerly-active-business", "old"]]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
writeRemembered("u1", "c");
assert.equal(readRemembered("u1"), "c");
assert.equal(readRemembered("u2"), null, "another user sees nothing");
assert.equal(
  store.has("ledgerly-active-business"),
  false,
  "legacy key removed",
);

console.log("activeBusiness.check: all passed");
