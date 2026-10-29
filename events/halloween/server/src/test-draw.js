// Rehearsal draw for the admin screen (`/hw/draw/?test=1`): random real customers from the shop
// database (names and Telegram avatars) play as if they took part, with made-up pumpkins and
// purchases. One rehearsal per pool, in memory only, sharing nothing with the real lists, locks or
// rounds — restarting the service or «Нові учасники» starts a fresh one.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { config } from "./config.js";
import { randomCustomers } from "./shop.js";
import { pumpkinWeight, orderTickets } from "./pools.js";
import { pick, publicId, displayName, maskHandle } from "./draw.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const sessions = new Map();

/** Roughly the spread a real event gives: many partial pumpkin sets, a few full ones, small orders. */
function fakeEntry(pool, tgId) {
  if (pool === "pumpkins") {
    const pumpkins = randomInt(100) < 30 ? randomInt(config.goal, config.goal + 10) : randomInt(1, config.goal);
    return { tgId, tickets: pumpkinWeight(pumpkins), pumpkins, orders: 0, spendMinor: 0 };
  }
  const spendMinor = config.minSpendMinor * (1 + (randomInt(100) < 25 ? randomInt(1, 4) : 0)) + randomInt(0, 40000);
  return { tgId, tickets: orderTickets(spendMinor), pumpkins: 0, orders: 1 + randomInt(2), spendMinor };
}

export async function reset(pool, n = 80) {
  const rows = await randomCustomers(Math.min(Math.max(Number(n) || 80, 5), 400));
  if (!rows.length) throw new Error("Немає бази магазину або в ній немає покупців");
  const profiles = new Map(rows.map((r) => [String(r.tg_id), r]));
  const entries = rows.map((r) => fakeEntry(pool, String(r.tg_id))).filter((e) => e.tickets > 0);
  const s = { entries, profiles, lock: null, draws: [] };
  sessions.set(pool, s);
  return s;
}

async function current(pool) {
  return sessions.get(pool) || (await reset(pool));
}

export async function lock(pool) {
  const s = await current(pool);
  if (!s.lock) {
    const snapshot = JSON.stringify(s.entries.map((e) => [e.tgId, e.tickets, e.pumpkins, e.orders, e.spendMinor]));
    const seed = randomBytes(32).toString("hex");
    s.lock = { seed, commitment: sha256(`${seed}:${sha256(snapshot)}`) };
  }
  return s.lock;
}

export async function drawRound(pool, reroll) {
  const s = await current(pool);
  const l = await lock(pool);
  const valid = s.draws.filter((d) => !d.voided);
  let round;
  if (reroll) {
    const last = valid[valid.length - 1];
    if (!last) throw new Error("Ще не було раундів");
    last.voided = true;
    round = last.round;
  } else {
    round = valid.length + 1;
    if (round > config.rounds[pool]) throw new Error("Усі раунди вже зіграні");
  }
  const attempt = s.draws.filter((d) => d.round === round).length + 1;
  const out = new Set(s.draws.map((d) => d.tgId));
  const left = s.entries.filter((e) => !out.has(e.tgId));
  if (!left.length) throw new Error("Пул порожній");
  const { entry, total } = pick(l.seed, round, attempt, left);
  s.draws.push({ round, attempt, tgId: entry.tgId, voided: false });
  return { round, attempt, winner: publicId(entry.tgId), totalTickets: total };
}

/** The live winner of a rehearsal round, with the real name: who the message would go to. */
export function winnerOf(pool, round) {
  const s = sessions.get(pool);
  const d = s?.draws.find((x) => x.round === Number(round) && !x.voided);
  if (!d) return null;
  const p = s.profiles.get(d.tgId) || {};
  return { tgId: d.tgId, username: p.username || null, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null };
}

/** Same shape as draw.screen(), plus `test: true`. */
export async function screen(pool) {
  const s = await current(pool);
  const out = new Set(s.draws.map((d) => d.tgId));
  return {
    test: true,
    pool,
    rounds: config.rounds[pool],
    locked: Boolean(s.lock),
    seedHash: s.lock?.commitment || "",
    participants: s.entries.map((e) => {
      const p = s.profiles.get(e.tgId);
      return {
        id: publicId(e.tgId),
        name: displayName(p),
        handle: maskHandle(p?.username),
        avatar: p?.photo_url || null,
        tickets: e.tickets,
        pumpkins: e.pumpkins,
        orders: e.orders,
        via: [pool],
        won: out.has(e.tgId),
      };
    }),
    winners: s.draws.filter((d) => !d.voided).map((d) => ({ round: d.round, participantId: publicId(d.tgId) })),
  };
}
