import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HW_DATA_DIR = mkdtempSync(join(tmpdir(), "hw-reset-"));
const { db } = await import("../src/db.js");
const { drawRound, resetRounds, proof } = await import("../src/draw.js");

// One participant: after a reset they must be back in the pool, or the redraw finds it empty.
db.prepare("INSERT INTO lock (pool, seed, snapshot, snapshot_hash, commitment, locked_at, locked_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
  .run("orders", "ab".repeat(32), JSON.stringify([["111", 3, 0, 1, 200000]]), "h", "c", Date.now(), "t");

test("reset frees every round and brings the winners back; the old draws stay in the proof", async () => {
  const first = await drawRound("orders", "t", false, 4);
  assert.equal(first.winnerTgId, "111");
  await assert.rejects(drawRound("orders", "t", false, 5), /Пул порожній/);

  assert.equal(resetRounds("orders"), 1);
  const again = await drawRound("orders", "t", false, 4);
  assert.equal(again.winnerTgId, "111");
  assert.equal(again.attempt, 2); // a fresh attempt, not a replay of the cleared one

  const rows = proof("orders").draws;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((d) => [d.voided, d.cleared]), [[1, 1], [0, 0]]);
});
