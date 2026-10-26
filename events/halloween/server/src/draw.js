// Participants and the stream draw.
//
// Fairness: before the stream the list is frozen ("lock"): a random seed is generated and only
// sha256(seed + ":" + sha256(snapshot)) is shown on screen. Every round is then a pure function of
// (seed, round, attempt, frozen list), so after the stream the seed and the list prove that nobody
// picked the winners by hand.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { db, tx } from "./db.js";
import { config } from "./config.js";
import { shopFacts, profiles } from "./shop.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Live list: everyone who collected the goal or bought this week, minus staff and exclusions. */
export async function liveEntries() {
  const facts = await shopFacts();
  const pumpkins = new Map();
  for (const r of db
    .prepare(
      `SELECT tg_id, SUM(c) AS n FROM (
         SELECT tg_id, COUNT(*) AS c FROM spawns WHERE collected_at IS NOT NULL GROUP BY tg_id
         UNION ALL SELECT tg_id, SUM(bonus) FROM code_uses GROUP BY tg_id
       ) GROUP BY tg_id`,
    )
    .all())
    pumpkins.set(String(r.tg_id), Number(r.n));
  const excluded = new Set([
    ...config.excludeIds,
    ...facts.staff,
    ...db.prepare("SELECT tg_id FROM excluded").all().map((r) => String(r.tg_id)),
  ]);
  const ids = new Set([...pumpkins.keys(), ...facts.orders.keys()]);
  const out = [];
  for (const tgId of ids) {
    if (excluded.has(tgId)) continue;
    const p = pumpkins.get(tgId) || 0;
    const o = facts.orders.get(tgId) || 0;
    const tickets = (p >= config.goal ? 1 : 0) + o;
    if (tickets > 0) out.push({ tgId, pumpkins: p, orders: o, tickets });
  }
  out.sort((a, b) => (BigInt(a.tgId) < BigInt(b.tgId) ? -1 : 1));
  return out;
}

export function getLock() {
  return db.prepare("SELECT * FROM lock WHERE id = 1").get() || null;
}

export async function lock(by) {
  const existing = getLock();
  if (existing) return existing;
  const entries = await liveEntries();
  if (!entries.length) throw new Error("Немає учасників");
  const snapshot = JSON.stringify(entries.map((e) => [e.tgId, e.tickets, e.pumpkins, e.orders]));
  const seed = randomBytes(32).toString("hex");
  const snapshotHash = sha256(snapshot);
  const commitment = sha256(`${seed}:${snapshotHash}`);
  db.prepare(
    "INSERT INTO lock (id, seed, snapshot, snapshot_hash, commitment, locked_at, locked_by) VALUES (1, ?, ?, ?, ?, ?, ?)",
  ).run(seed, snapshot, snapshotHash, commitment, Date.now(), by);
  return getLock();
}

function frozenEntries(l) {
  return JSON.parse(l.snapshot).map(([tgId, tickets, pumpkins, orders]) => ({ tgId, tickets, pumpkins, orders }));
}

function draws() {
  return db.prepare("SELECT * FROM draws ORDER BY id").all();
}

/** Deterministic weighted pick: HMAC(seed, "round:attempt") as a number mod total tickets. */
export function pick(seed, round, attempt, pool) {
  const total = pool.reduce((s, e) => s + e.tickets, 0);
  const h = createHmac("sha256", Buffer.from(seed, "hex")).update(`${round}:${attempt}`).digest("hex");
  let x = Number(BigInt("0x" + h) % BigInt(total));
  for (const e of pool) {
    if ((x -= e.tickets) < 0) return { entry: e, total };
  }
  return { entry: pool[pool.length - 1], total };
}

/**
 * Next round, or (reroll) the last round again: its winner did not answer, is voided and stays
 * out of the pool, the round is drawn with the next attempt number.
 */
export async function drawRound(by, reroll) {
  const l = getLock() || (await lock(by));
  return tx(() => {
    const all = draws();
    const valid = all.filter((d) => !d.voided);
    let round;
    if (reroll) {
      const last = valid[valid.length - 1];
      if (!last) throw new Error("Ще не було раундів");
      db.prepare("UPDATE draws SET voided = 1 WHERE id = ?").run(last.id);
      round = last.round;
    } else {
      round = valid.length + 1;
      if (round > config.rounds) throw new Error("Усі раунди вже зіграні");
    }
    const attempt = all.filter((d) => d.round === round).length + 1;
    const out = new Set(db.prepare("SELECT tg_id FROM draws").all().map((d) => d.tg_id)); // winners and voided
    const pool = frozenEntries(l).filter((e) => !out.has(e.tgId));
    if (!pool.length) throw new Error("Пул порожній");
    const { entry, total } = pick(l.seed, round, attempt, pool);
    db.prepare("INSERT INTO draws (round, attempt, tg_id, drawn_at, drawn_by) VALUES (?, ?, ?, ?, ?)").run(
      round, attempt, entry.tgId, Date.now(), by,
    );
    return { round, attempt, winnerTgId: entry.tgId, totalTickets: total };
  });
}

// ---- presentation ----

/** Opaque id for the screen: the stream must not show Telegram ids. */
export function publicId(tgId) {
  return sha256(`hw:${config.jwtSecret}:${tgId}`).slice(0, 12);
}

export function displayName(p) {
  const first = (p?.first_name || "").trim();
  const last = (p?.last_name || "").trim();
  if (first) return `${first.slice(0, 18)}${last ? " " + [...last][0] + "." : ""}`;
  if (p?.username) return maskHandle(p.username);
  return "Гравець";
}

export function maskHandle(u) {
  if (!u) return null;
  return "@" + u.slice(0, Math.min(3, Math.max(1, u.length - 2))) + "***";
}

/** Everything the draw screen needs, in the VISUAL-CONTRACT shape. */
export async function screen() {
  const l = getLock();
  const entries = l ? frozenEntries(l) : await liveEntries();
  const ds = draws();
  const out = new Set(ds.map((d) => d.tg_id));
  const prof = await profiles(entries.map((e) => e.tgId));
  const participants = entries.map((e) => {
    const p = prof.get(e.tgId);
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
  });
  return {
    locked: Boolean(l),
    seedHash: l?.commitment || "",
    participants,
    winners: ds.filter((d) => !d.voided).map((d) => ({ round: d.round, participantId: publicId(d.tg_id) })),
  };
}

/** For Maxim to contact the winners: full names, usernames, Telegram ids. Admin only. */
export async function winnersFull() {
  const ds = draws();
  const prof = await profiles([...new Set(ds.map((d) => d.tg_id))]);
  return ds.map((d) => {
    const p = prof.get(d.tg_id) || {};
    return {
      drawId: d.id,
      round: d.round,
      attempt: d.attempt,
      voided: Boolean(d.voided),
      tgId: d.tg_id,
      username: p.username || null,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
      drawnAt: new Date(Number(d.drawn_at)).toISOString(),
    };
  });
}

export function proof() {
  const l = getLock();
  if (!l) return null;
  return { seed: l.seed, snapshotHash: l.snapshot_hash, commitment: l.commitment, snapshot: JSON.parse(l.snapshot), draws: draws() };
}
