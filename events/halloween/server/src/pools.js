// The two draws of the event and who is in each of them. Everything about "how much one person
// weighs" lives here, so the draw, the progress panel and the bot notifications agree.
//
//   pumpkins — everyone who found at least one pumpkin. A full set (config.goal) weighs
//              config.fullWeight; a partial set weighs one per pumpkin, so 1 of 15 is a long shot.
//   orders   — orders inside the window that add up to config.minSpendMinor: one ticket per
//              minSpend, at most config.maxOrderTickets.
import { db } from "./db.js";
import { config } from "./config.js";
import { shopFacts } from "./shop.js";

export const POOLS = ["pumpkins", "orders"];

/** A pool name from the outside (query string): unknown → an error, not a silent default. */
export function poolOf(raw) {
  const p = String(raw || "pumpkins");
  if (!POOLS.includes(p)) throw new Error("Немає такого розіграшу");
  return p;
}

export function pumpkinWeight(n) {
  if (n >= config.goal) return config.fullWeight;
  return Math.max(0, Math.floor(n));
}

export function orderTickets(spendMinor) {
  if (!(config.minSpendMinor > 0)) return 0;
  return Math.min(config.maxOrderTickets, Math.floor(spendMinor / config.minSpendMinor));
}

/** Pumpkins per person: collected ones plus code-word bonuses. */
export function pumpkinTotals() {
  const m = new Map();
  for (const r of db
    .prepare(
      `SELECT tg_id, SUM(c) AS n FROM (
         SELECT tg_id, COUNT(*) AS c FROM spawns WHERE collected_at IS NOT NULL GROUP BY tg_id
         UNION ALL SELECT tg_id, SUM(bonus) FROM code_uses GROUP BY tg_id
       ) GROUP BY tg_id`,
    )
    .all())
    m.set(String(r.tg_id), Number(r.n));
  return m;
}

/** Staff, tech accounts and people excluded by hand never take part. */
export async function excludedIds() {
  const facts = await shopFacts();
  return new Set([
    ...config.excludeIds,
    ...facts.staff,
    ...db.prepare("SELECT tg_id FROM excluded").all().map((r) => String(r.tg_id)),
  ]);
}

/** Live list of one draw, sorted by Telegram id (the frozen snapshot keeps this order). */
export async function liveEntries(pool) {
  const facts = await shopFacts();
  const excluded = await excludedIds();
  const out = [];
  if (pool === "pumpkins") {
    for (const [tgId, n] of pumpkinTotals()) {
      const tickets = pumpkinWeight(n);
      if (tickets > 0 && !excluded.has(tgId)) out.push({ tgId, tickets, pumpkins: n, orders: 0, spendMinor: 0 });
    }
  } else {
    for (const [tgId, o] of facts.orders) {
      const tickets = orderTickets(o.spendMinor);
      if (tickets > 0 && !excluded.has(tgId)) out.push({ tgId, tickets, pumpkins: 0, orders: o.n, spendMinor: o.spendMinor });
    }
  }
  out.sort((a, b) => (BigInt(a.tgId) < BigInt(b.tgId) ? -1 : 1));
  return out;
}
