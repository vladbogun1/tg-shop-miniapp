import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HW_DATA_DIR = mkdtempSync(join(tmpdir(), "hw-manual-"));
const { earlierCustomers } = await import("../src/manual-spend.js");

test("shop spend alone, as before", () => {
  const r = earlierCustomers(new Map([["1", 150000], ["2", 50000]]), new Map(), 100000);
  assert.deepEqual([...r], [["1", 150000]]);
});

test("money spent before the database adds to the shop's", () => {
  const r = earlierCustomers(new Map([["2", 50000]]), new Map([["2", 60000], ["3", 200000]]), 100000);
  assert.equal(r.get("2"), 110000);
  assert.equal(r.get("3"), 200000);
});

test("still below the threshold = not an earlier customer", () => {
  const r = earlierCustomers(new Map([["4", 10000]]), new Map([["4", 20000]]), 100000);
  assert.equal(r.has("4"), false);
});
