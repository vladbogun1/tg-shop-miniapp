import { test } from "node:test";
import assert from "node:assert/strict";

const show = await import("../src/show.js");

test("announce puts the round and its visual on the scene without drawing", () => {
  show.set({ pause: true, blackout: true });
  const s = show.announce({ pool: "orders", test: true, round: 3, visual: "casino" });
  assert.equal(s.visual, "casino");
  assert.equal(s.pool, "orders");
  assert.equal(s.test, true);
  assert.deepEqual({ ...s.announce, id: 0, at: 0 }, { id: 0, pool: "orders", test: true, round: 3, visual: "casino", at: 0 });
  assert.equal(s.pause, false);
  assert.equal(s.blackout, false);
  assert.equal(s.roll, null);
});

test("the roll of the announced round skips the lot card and clears the announcement", () => {
  show.announce({ pool: "orders", test: true, round: 3, visual: "casino" });
  show.rolled("orders", true, { round: 3, winner: "w1", totalTickets: 9 }, "casino");
  const s = show.snapshot();
  assert.equal(s.announce, null);
  assert.equal(s.roll.announced, true);
});

test("a roll of another round still plays the whole intro", () => {
  show.announce({ pool: "orders", test: true, round: 3, visual: "casino" });
  show.rolled("orders", true, { round: 4, winner: "w2", totalTickets: 9 }, "casino");
  assert.equal(show.snapshot().roll.announced, false);
  assert.equal(show.snapshot().announce, null);
});

test("cancel takes the announcement off; bad input is refused", () => {
  show.announce({ pool: "pumpkins", test: false, round: 1, visual: "loto" });
  assert.equal(show.announce({ cancel: true }).announce, null);
  assert.throws(() => show.announce({ pool: "pumpkins", round: 0, visual: "loto" }), /раунд/i);
  assert.throws(() => show.announce({ pool: "nope", round: 1, visual: "loto" }), /розыгрыш/i);
});
