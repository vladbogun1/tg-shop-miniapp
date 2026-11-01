import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HW_DATA_DIR ||= (await import("node:os")).tmpdir();
const { pumpkinWeight } = await import("../src/pools.js");

test("pumpkin tickets grow as n², the full set is twice 15²", () => {
  assert.deepEqual([0, 1, 2, 8, 13, 14].map(pumpkinWeight), [0, 1, 4, 64, 169, 196]);
  assert.equal(pumpkinWeight(15), 450);
  assert.equal(pumpkinWeight(16), 450);
});

test("no cliff at the full set: 14 → 15 stays within ×3", () => {
  assert.ok(pumpkinWeight(15) / pumpkinWeight(14) < 3);
  for (let n = 1; n < 15; n++) assert.ok(pumpkinWeight(n + 1) > pumpkinWeight(n));
});
