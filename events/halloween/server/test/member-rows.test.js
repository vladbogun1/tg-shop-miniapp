import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, summarize } from "../src/member-rows.js";

const base = () => ({
  pumpkins: new Map([["1", { n: 15, days: 2, first: 10, last: 20 }], ["2", { n: 3, days: 1, first: 5, last: 5 }], ["9", { n: 4, days: 1, first: 1, last: 1 }]]),
  orders: new Map([["2", { n: 1, spendMinor: 120000 }]]),
  old: new Map([["3", 250000], ["4", 110000]]),
  pumpkinPool: [{ tgId: "1", tickets: 100 }, { tgId: "2", tickets: 3 }],
  orderPool: [{ tgId: "2", tickets: 2 }, { tgId: "3", tickets: 1 }],
  invites: new Map([["3", { state: "joined", joinedAt: 7, sentAt: 6 }], ["4", { state: "blocked", sentAt: 6 }]]),
  restSends: new Map([["1", { status: "ok", at: 8 }], ["2", { status: "blocked", at: 9 }]]),
  excluded: new Map(),
  staff: new Set(["9"]),
});

test("one row per person, staff left out", () => {
  const rows = buildRows(base());
  assert.deepEqual(rows.map((r) => r.tgId).sort(), ["1", "2", "3", "4"]);
});

test("tickets and chance come from the live draws", () => {
  const r = Object.fromEntries(buildRows(base()).map((x) => [x.tgId, x]));
  assert.equal(r["1"].pumpkinTickets, 100);
  assert.equal(r["1"].pumpkinChance, 100 / 103);
  assert.equal(r["2"].orderTickets, 2);
  assert.equal(r["3"].orderChance, 1 / 3);
  assert.equal(r["4"].orderTickets, 0);
});

test("broadcast: invite state for earlier customers, the rest campaign for everyone else", () => {
  const r = Object.fromEntries(buildRows(base()).map((x) => [x.tgId, x]));
  assert.equal(r["3"].broadcast, "ok");
  assert.equal(r["4"].broadcast, "blocked");
  assert.equal(r["2"].broadcast, "blocked");
  assert.equal(r["1"].broadcast, "ok");
});

test("an excluded person keeps their stats but has no tickets", () => {
  const i = base();
  i.excluded.set("2", "скрипт");
  i.pumpkinPool = i.pumpkinPool.filter((e) => e.tgId !== "2");
  i.orderPool = i.orderPool.filter((e) => e.tgId !== "2");
  const r = buildRows(i).find((x) => x.tgId === "2");
  assert.equal(r.excluded, "скрипт");
  assert.equal(r.pumpkins, 3);
  assert.equal(r.pumpkinTickets, 0);
  assert.equal(r.spendMinor, 120000);
});

test("summary", () => {
  const s = summarize(buildRows(base()), 15);
  assert.equal(s.total, 4);
  assert.equal(s.fullSets, 1);
  assert.equal(s.pumpkinsCollected, 18);
  assert.equal(s.oldJoined, 1);
  assert.equal(s.blocked, 2);
});
