// The admin «Учасники» view of one draw, with full names (never on the stream screen): whom to exclude
// before the lock, whom to return, and whether a purchase-draw winner still has the money in — a refund
// after the lock does not change the frozen list, so Maxim checks it before sending the prize.
import { db } from "./db.js";
import { config } from "./config.js";
import { liveEntries } from "./pools.js";
import { getLock, publicId } from "./draw.js";
import { ordersOf, profiles, findUser, freshFacts } from "./shop.js";
import { overview, joinByAdmin, unjoinAdmin } from "./invites.js";
import { setManual, removeManual } from "./manual-spend.js";

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
      .map((e) => ({ ...who(e.tgId), tickets: e.tickets, pumpkins: e.pumpkins, spendMinor: e.spendMinor || 0, old: Boolean(e.old) })),
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

/** «Розсилка»: earlier customers with names, their state (joined / grey / blocked / not sent) and the numbers. */
export async function invites() {
  const o = await overview();
  const prof = await profiles(o.rows.map((r) => r.tgId));
  const order = { joined: 0, grey: 1, "not-sent": 2, error: 3, blocked: 4 };
  const rows = o.rows
    .map((r) => {
      const p = prof.get(r.tgId);
      return { ...r, name: fullName(p), username: p?.username || null };
    })
    .sort((a, b) => order[a.state] - order[b.state] || b.oldSpendMinor - a.oldSpendMinor);
  return { ...o, rows, oldMinSpendMinor: config.oldMinSpendMinor, oldTickets: config.oldTickets };
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const uah = (minor) => Math.round(minor / 100).toLocaleString("ru-RU");

/**
 * «Добавить вручную»: a customer whose purchases are older than the shop database. The typed money adds
 * to their spend before the event; reaching the earlier-customer threshold puts them in the purchase draw
 * (joined by the admin, no invite needed). Only before the purchase list is frozen.
 */
export async function addManual({ who, spendUah, note }, by) {
  if (getLock("orders")) throw fail("Список розыгрыша покупок уже зафиксирован", 409);
  const u = await findUser(who);
  if (!u) throw fail("Такого пользователя нет в базе магазина: нужен Telegram id или @ник того, кто заходил в магазин", 404);
  const spendMinor = Math.round(Number(spendUah) * 100);
  if (!(spendMinor > 0) || spendMinor > 100_000_000) throw fail("Сумма должна быть от 1 ₴");
  const shopMinor = (await freshFacts()).before.get(u.tg_id) || 0;
  const total = shopMinor + spendMinor;
  if (total < config.oldMinSpendMinor)
    throw fail(`Вместе с заказами в базе получается ${uah(total)} ₴, а для розыгрыша нужно от ${uah(config.oldMinSpendMinor)} ₴`);
  setManual(u.tg_id, spendMinor, note, by);
  joinByAdmin(u.tg_id);
  await freshFacts();
  return { tgId: u.tg_id, name: fullName(u), username: u.username || null, shopMinor, manualMinor: spendMinor, oldSpendMinor: total };
}

/** Undo of addManual. */
export async function dropManual(tgId) {
  if (getLock("orders")) throw fail("Список розыгрыша покупок уже зафиксирован", 409);
  if (!removeManual(tgId)) throw fail("У этого человека нет ручной суммы", 404);
  unjoinAdmin(tgId);
  await freshFacts();
}
