// Pumpkins. A pumpkin is a one-time ticket the server issues; a tap counts only for
// the ticket's owner, inside its lifetime and not faster than a finger can react.
import { randomBytes, randomInt } from "node:crypto";
import { db, tx } from "./db.js";
import { config } from "./config.js";
import { ordersOf } from "./shop.js";
import { pumpkinWeight, orderTickets } from "./pools.js";

export const PUMPKIN_KINDS = 4;

export function kyivDay(ms = Date.now()) {
  return new Date(ms + config.tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function phase(now = Date.now()) {
  if (now < config.startsAt.getTime()) return "soon";
  if (now >= config.endsAt.getTime()) return "over";
  return "live";
}

const q = {
  collectedTotal: db.prepare("SELECT COUNT(*) AS n FROM spawns WHERE tg_id = ? AND collected_at IS NOT NULL"),
  collectedDay: db.prepare("SELECT COUNT(*) AS n FROM spawns WHERE tg_id = ? AND day = ? AND collected_at IS NOT NULL"),
  ipDay: db.prepare("SELECT COUNT(*) AS n FROM spawns WHERE ip = ? AND day = ? AND collected_at IS NOT NULL"),
  lastSpawn: db.prepare("SELECT issued_at FROM spawns WHERE tg_id = ? ORDER BY issued_at DESC LIMIT 1"),
  insertSpawn: db.prepare(
    "INSERT INTO spawns (id, tg_id, kind, issued_at, expires_at, day, ip, app) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  spawn: db.prepare("SELECT * FROM spawns WHERE id = ?"),
  collect: db.prepare("UPDATE spawns SET collected_at = ? WHERE id = ? AND collected_at IS NULL"),
};

export function pumpkinsOf(tgId) {
  return Number(q.collectedTotal.get(tgId).n);
}

/**
 * One person's standing in both draws: `full` = a whole set of pumpkins (the real chance, a partial
 * set only gives a long shot); `spendMinor` / `orderTickets` = purchases in the window and their tickets.
 */
export async function progress(tgId) {
  const pumpkins = pumpkinsOf(tgId);
  const today = Number(q.collectedDay.get(tgId, kyivDay()).n);
  const o = await ordersOf(tgId);
  const orderTix = orderTickets(o.spendMinor);
  const pools = { pumpkins: pumpkinWeight(pumpkins) > 0, orders: orderTix > 0 };
  return {
    pumpkins,
    today,
    full: pumpkins >= config.goal,
    orders: o.n,
    spendMinor: o.spendMinor,
    orderTickets: orderTix,
    pools,
    inDraw: pools.pumpkins || pools.orders,
  };
}

export function publicState() {
  return {
    phase: phase(),
    startsAt: config.startsAt.toISOString(),
    endsAt: config.endsAt.toISOString(),
    streamAt: config.streamAt,
    streams: config.streams,
    goal: config.goal,
    dailyCap: config.dailyCap,
    minSpendMinor: config.minSpendMinor,
    maxOrderTickets: config.maxOrderTickets,
  };
}

/** A new pumpkin for this person, or the reason there is none right now. */
export function spawn(tgId, ip, app) {
  if (phase() !== "live") return { none: "not-live" };
  const now = Date.now();
  const day = kyivDay(now);
  if (Number(q.collectedDay.get(tgId, day).n) >= config.dailyCap) return { none: "daily-cap" };
  if (pumpkinsOf(tgId) >= config.goal) return { none: "full" };
  if (ip && Number(q.ipDay.get(ip, day).n) >= config.ipDailyCap) return { none: "daily-cap" };
  const last = q.lastSpawn.get(tgId);
  const gap = config.spawnGapSec * 1000;
  if (last && now - Number(last.issued_at) < gap) return { none: "wait", waitMs: gap - (now - Number(last.issued_at)) };
  const id = randomBytes(12).toString("base64url");
  const kind = randomInt(1, PUMPKIN_KINDS + 1);
  q.insertSpawn.run(id, tgId, kind, now, now + config.spawnTtlSec * 1000, day, ip || null, app || null);
  return { id, kind, ttlMs: config.spawnTtlSec * 1000 };
}

export function collect(tgId, id) {
  const now = Date.now();
  return tx(() => {
    const s = q.spawn.get(String(id || ""));
    if (!s || s.tg_id !== tgId) return { ok: false, reason: "unknown" };
    if (s.collected_at) return { ok: false, reason: "already" };
    if (now < Number(s.issued_at) + config.minReactMs) return { ok: false, reason: "too-fast" };
    if (now > Number(s.expires_at) + 1500) return { ok: false, reason: "gone" };
    if (Number(q.collectedDay.get(tgId, s.day).n) >= config.dailyCap) return { ok: false, reason: "daily-cap" };
    q.collect.run(now, s.id);
    return { ok: true };
  });
}

export function stats() {
  const days = db
    .prepare(
      `SELECT day, COUNT(*) AS shown, SUM(collected_at IS NOT NULL) AS collected, COUNT(DISTINCT tg_id) AS people
         FROM spawns GROUP BY day ORDER BY day`,
    )
    .all();
  const reached = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT tg_id FROM spawns WHERE collected_at IS NOT NULL GROUP BY tg_id HAVING COUNT(*) >= ?)`,
    )
    .get(config.goal).n;
  return { days, reachedGoal: Number(reached) };
}
