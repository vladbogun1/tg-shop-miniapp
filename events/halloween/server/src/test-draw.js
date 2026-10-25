// Rehearsal draw for the admin screen (`/hw/draw/?test=1`): random real customers from the shop
// database (names and Telegram avatars) play as if they took part, with made-up pumpkins, orders and
// tickets. Lives in memory only and shares nothing with the real list, lock or rounds — restarting
// the service or «Нові учасники» starts a fresh rehearsal.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { config } from "./config.js";
import { randomCustomers } from "./shop.js";
import { pick, publicId, displayName, maskHandle } from "./draw.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
let session = null;

/** Mostly one ticket, sometimes more — about the spread a real week gives. */
function fakeFacts() {
  const orders = randomInt(100) < 35 ? 1 + (randomInt(100) < 25 ? randomInt(1, 4) : 0) : 0;
  const pumpkins = orders && randomInt(100) < 50 ? randomInt(0, config.goal) : randomInt(config.goal, config.goal + 40);
  return { pumpkins, orders, tickets: (pumpkins >= config.goal ? 1 : 0) + orders };
}

export async function reset(n = 80) {
  const rows = await randomCustomers(Math.min(Math.max(Number(n) || 80, 5), 400));
  if (!rows.length) throw new Error("Немає бази магазину або в ній немає покупців");
  const profiles = new Map(rows.map((r) => [String(r.tg_id), r]));
  const entries = rows.map((r) => ({ tgId: String(r.tg_id), ...fakeFacts() })).filter((e) => e.tickets > 0);
  session = { entries, profiles, lock: null, draws: [] };
  return session;
}

async function current() {
  return session || (await reset());
}

export async function lock() {
  const s = await current();
  if (!s.lock) {
    const snapshot = JSON.stringify(s.entries.map((e) => [e.tgId, e.tickets, e.pumpkins, e.orders]));
    const seed = randomBytes(32).toString("hex");
    s.lock = { seed, commitment: sha256(`${seed}:${sha256(snapshot)}`) };
  }
  return s.lock;
}

export async function drawRound(reroll) {
  const s = await current();
  const l = await lock();
  const valid = s.draws.filter((d) => !d.voided);
  let round;
  if (reroll) {
    const last = valid[valid.length - 1];
    if (!last) throw new Error("Ще не було раундів");
    last.voided = true;
    round = last.round;
  } else {
    round = valid.length + 1;
    if (round > config.rounds) throw new Error("Усі раунди вже зіграні");
  }
  const attempt = s.draws.filter((d) => d.round === round).length + 1;
  const out = new Set(s.draws.map((d) => d.tgId));
  const pool = s.entries.filter((e) => !out.has(e.tgId));
  if (!pool.length) throw new Error("Пул порожній");
  const { entry, total } = pick(l.seed, round, attempt, pool);
  s.draws.push({ round, attempt, tgId: entry.tgId, voided: false });
  return { round, attempt, winner: publicId(entry.tgId), totalTickets: total };
}

/** The live winner of a rehearsal round, with the real name: who the message would go to. */
export function winnerOf(round) {
  const d = session?.draws.find((x) => x.round === Number(round) && !x.voided);
  if (!d) return null;
  const p = session.profiles.get(d.tgId) || {};
  return { tgId: d.tgId, username: p.username || null, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null };
}

/** Same shape as draw.screen(), plus `test: true`. */
export async function screen() {
  const s = await current();
  const out = new Set(s.draws.map((d) => d.tgId));
  return {
    test: true,
    locked: Boolean(s.lock),
    seedHash: s.lock?.commitment || "",
    participants: s.entries.map((e) => {
      const p = s.profiles.get(e.tgId);
      const via = [];
      if (e.pumpkins >= config.goal) via.push("pumpkins");
      if (e.orders > 0) via.push("orders");
      return {
        id: publicId(e.tgId),
        name: displayName(p),
        handle: maskHandle(p?.username),
        avatar: p?.photo_url || null,
        tickets: e.tickets,
        pumpkins: e.pumpkins,
        orders: e.orders,
        via,
        won: out.has(e.tgId),
      };
    }),
    winners: s.draws.filter((d) => !d.voided).map((d) => ({ round: d.round, participantId: publicId(d.tgId) })),
  };
}
