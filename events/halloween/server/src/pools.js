// The two draws of the event and who is in each of them. Everything about "how much one person
// weighs" lives here, so the draw, the progress panel and the bot notifications agree.
//
//   pumpkins — everyone who found at least one pumpkin. A partial set weighs one per pumpkin; a full
//              set (config.goal) weighs config.fullWeight or more: partial sets together never get
//              more than config.partialShare of the chance, however many of them there are.
//   orders   — orders inside the window that add up to config.minSpendMinor: one ticket per
//              minSpend, at most config.maxOrderTickets; plus earlier customers who pressed
//              «Участвовать» (invites.js), config.oldTickets each, new orders on top, same cap.
import { db } from "./db.js";
import { config } from "./config.js";
import { shopFacts } from "./shop.js";
import { joinedOld } from "./invites.js";

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

/** Purchase draw: an earlier customer who joined starts with oldTickets; new orders add, same cap. */
export function purchaseTickets(spendMinor, joinedOld) {
  const base = joinedOld ? config.oldTickets : 0;
  return Math.min(config.maxOrderTickets, base + orderTickets(spendMinor));
}

/** Pumpkins collected per person. */
export function pumpkinTotals() {
  const m = new Map();
  for (const r of db
    .prepare(
      "SELECT tg_id, COUNT(*) AS n FROM spawns WHERE collected_at IS NOT NULL GROUP BY tg_id",
    )
    .all())
    m.set(String(r.tg_id), Number(r.n));
  return m;
}

/**
 * Many people drop by for a pumpkin or two; together they could outweigh the few full sets. Raise the
 * weight of a full set until partial sets hold at most `partialShare` of all tickets (integers only:
 * the draw picks by ticket number).
 */
export function capPartialShare(entries, share = config.partialShare) {
  const full = entries.filter((e) => e.pumpkins >= config.goal);
  if (!full.length || !(share > 0 && share < 1)) return entries;
  const partial = entries.reduce((s, e) => s + (e.pumpkins >= config.goal ? 0 : e.tickets), 0);
  const need = Math.ceil((partial * (1 - share)) / (share * full.length));
  const w = Math.max(config.fullWeight, need);
  for (const e of full) e.tickets = w;
  return entries;
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
    capPartialShare(out);
  } else {
    const joined = await joinedOld();
    for (const tgId of new Set([...facts.orders.keys(), ...joined.keys()])) {
      const o = facts.orders.get(tgId) || { n: 0, spendMinor: 0 };
      const tickets = purchaseTickets(o.spendMinor, joined.has(tgId));
      if (tickets > 0 && !excluded.has(tgId))
        out.push({ tgId, tickets, pumpkins: 0, orders: o.n, spendMinor: o.spendMinor, old: joined.has(tgId), oldSpendMinor: facts.old.get(tgId) || 0 });
    }
  }
  out.sort((a, b) => (BigInt(a.tgId) < BigInt(b.tgId) ? -1 : 1));
  return out;
}
