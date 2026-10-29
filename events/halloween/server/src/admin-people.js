// The admin «Учасники» view of one draw, with full names (never on the stream screen): whom to exclude
// before the lock, whom to return, and whether a purchase-draw winner still has the money in — a refund
// after the lock does not change the frozen list, so Maxim checks it before sending the prize.
import { db } from "./db.js";
import { config } from "./config.js";
import { liveEntries } from "./pools.js";
import { getLock, publicId } from "./draw.js";
import { ordersOf, profiles } from "./shop.js";

const fullName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(" ") || null;

export async function people(pool) {
  const entries = await liveEntries(pool);
  const excluded = db.prepare("SELECT tg_id, note FROM excluded ORDER BY at DESC").all();
  const prof = await profiles([...entries.map((e) => e.tgId), ...excluded.map((x) => String(x.tg_id))]);
  const who = (tgId) => {
    const p = prof.get(tgId);
    return { id: publicId(tgId), tgId, name: fullName(p), username: p?.username || null };
  };
  return {
    locked: Boolean(getLock(pool)),
    people: entries
      .sort((a, b) => b.tickets - a.tickets)
      .map((e) => ({ ...who(e.tgId), tickets: e.tickets, pumpkins: e.pumpkins, spendMinor: e.spendMinor || 0 })),
    excluded: excluded.map((x) => ({ ...who(String(x.tg_id)), note: x.note || "" })),
  };
}

/** Back into the draws (an exclusion made by mistake). Only before the lock, like the exclusion itself. */
export function include(pool, tgId) {
  if (getLock(pool)) throw Object.assign(new Error("Список уже зафіксовано"), { status: 409 });
  db.prepare("DELETE FROM excluded WHERE tg_id = ?").run(String(tgId || ""));
}

/** Purchase draw: what the winner had in at the lock and has in now (minor units). */
export async function withSpend(pool, winners) {
  if (pool !== "orders") return winners;
  const l = getLock(pool);
  const atLock = new Map(l ? JSON.parse(l.snapshot).map((r) => [String(r[0]), Number(r[4] || 0)]) : []);
  return Promise.all(
    winners.map(async (w) => {
      const now = (await ordersOf(w.tgId)).spendMinor;
      return { ...w, lockedSpendMinor: atLock.get(w.tgId) ?? null, nowSpendMinor: now, belowMin: now < config.minSpendMinor };
    }),
  );
}
