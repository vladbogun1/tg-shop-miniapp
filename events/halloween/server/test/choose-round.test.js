import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HW_DATA_DIR = mkdtempSync(join(tmpdir(), "hw-round-"));
const { chooseRound } = await import("../src/draw.js");

test("no round asked: the lowest free one, as the old one-page screen expects", () => {
  assert.equal(chooseRound([], 10), 1);
  assert.equal(chooseRound([1, 2, 10], 10), 3);
});

test("the remote may play any free round, the super prize first if Maxim wants", () => {
  assert.equal(chooseRound([], 10, 10), 10);
  assert.equal(chooseRound([10], 10, 4), 4);
});

test("a played round is refused, so a double click does not burn a second one", () => {
  assert.throws(() => chooseRound([3], 10, 3), /уже зіграно/);
});

test("out of range and all played", () => {
  assert.throws(() => chooseRound([], 10, 11), /Немає такого раунду/);
  assert.throws(() => chooseRound([1, 2], 2), /Усі раунди вже зіграні/);
});
