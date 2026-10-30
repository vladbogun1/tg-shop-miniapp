import { test } from "node:test";
import assert from "node:assert/strict";
import { gapMultiplier } from "../src/pace.js";

test("late joiner keeps the normal pause", () => {
  assert.equal(gapMultiplier(0, 8, 4), 1);
});

test("a full day before today = slowMax times longer", () => {
  assert.equal(gapMultiplier(8, 8, 4), 4);
  assert.equal(gapMultiplier(14, 8, 4), 4);
});

test("half a day before = halfway", () => {
  assert.equal(gapMultiplier(4, 8, 4), 2.5);
});

test("slowMax 1 or bad input switches it off", () => {
  assert.equal(gapMultiplier(8, 8, 1), 1);
  assert.equal(gapMultiplier(8, 0, 4), 1);
  assert.equal(gapMultiplier(8, 8, NaN), 1);
});
