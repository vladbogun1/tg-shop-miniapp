// Participants and the stream draws (two of them: pumpkins and purchases, see pools.js).
//
// Fairness: before the stream each list is frozen ("lock"): a random seed is generated and only
// sha256(seed + ":" + sha256(snapshot)) is shown on screen. Every round is then a pure function of
// (seed, round, attempt, frozen list), so after the stream the seed and the list prove that nobody
// picked the winners by hand.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { db, tx } from "./db.js";
import { config } from "./config.js";
import { freshFacts, profiles } from "./shop.js";
import { liveEntries } from "./pools.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export { liveEntries };

export function getLock(pool) {
  return db.prepare("SELECT * FROM lock WHERE pool = ?").get(pool) || null;
}

export async function lock(pool, by) {
  const existing = getLock(pool);
  if (existing) return existing;
  // A lock is final: taken while pumpkins and orders still count, it would leave everyone after it out.
  if (Date.now() < config.endsAt.getTime()) {
    throw new Error(`Збір ще триває до ${config.endsAt.toISOString().slice(0, 16).replace("T", " ")} UTC — фіксувати список зарано`);
  }
  // Staff and orders must come from the shop database right now, not from an empty fallback after an error.
  await freshFacts();
  const entries = await liveEntries(pool);
  if (!entries.length) throw new Error("Немає учасників");
  const snapshot = JSON.stringify(entries.map((e) => [e.tgId, e.tickets, e.pumpkins, e.orders, e.spendMinor]));
  const seed = randomBytes(32).toString("hex");
  const snapshotHash = sha256(snapshot);
  const commitment = sha256(`${seed}:${snapshotHash}`);
  db.prepare(
    "INSERT INTO lock (pool, seed, snapshot, snapshot_hash, commitment, locked_at, locked_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(pool, seed, snapshot, snapshotHash, commitment, Date.now(), by);
  return getLock(pool);
}

function frozenEntries(l) {
  return JSON.parse(l.snapshot).map(([tgId, tickets, pumpkins, orders, spendMinor = 0]) => ({ tgId, tickets, pumpkins, orders, spendMinor }));
}

function draws(pool) {
  return db.prepare("SELECT * FROM draws WHERE pool = ? ORDER BY id").all(pool);
}

/** Deterministic weighted pick: HMAC(seed, "round:attempt") as a number mod total tickets. */
export function pick(seed, round, attempt, entries) {
  const total = entries.reduce((s, e) => s + e.tickets, 0);
  const h = createHmac("sha256", Buffer.from(seed, "hex")).update(`${round}:${attempt}`).digest("hex");
  let x = Number(BigInt("0x" + h) % BigInt(total));
  for (const e of entries) {
    if ((x -= e.tickets) < 0) return { entry: e, total };
  }
  return { entry: entries[entries.length - 1], total };
}

/**
 * Next round, or (reroll) the last round again: its winner did not answer, is voided and stays
 * out of the pool, the round is drawn with the next attempt number.
 */
export async function drawRound(pool, by, reroll, expectRound) {
  const l = getLock(pool) || (await lock(pool, by));
  return tx(() => {
    const all = draws(pool);
    const valid = all.filter((d) => !d.voided);
    let round;
    if (reroll) {
      const last = valid[valid.length - 1];
      if (!last) throw new Error("Ще не було раундів");
      db.prepare("UPDATE draws SET voided = 1 WHERE id = ?").run(last.id);
      round = last.round;
    } else {
      round = valid.length + 1;
      if (round > config.rounds[pool]) throw new Error("Усі раунди вже зіграні");
      // Two clicks or two open screens must not burn two rounds.
      if (expectRound && Number(expectRound) !== round) throw new Error(`Раунд ${expectRound} уже зіграно — онови сторінку`);
    }
    const attempt = all.filter((d) => d.round === round).length + 1;
    // Winners and voided winners of this draw. Winning one draw does not keep you out of the other.
    const out = new Set(all.map((d) => d.tg_id));
    const left = frozenEntries(l).filter((e) => !out.has(e.tgId));
    if (!left.length) throw new Error("Пул порожній");
    const { entry, total } = pick(l.seed, round, attempt, left);
    db.prepare("INSERT INTO draws (pool, round, attempt, tg_id, drawn_at, drawn_by) VALUES (?, ?, ?, ?, ?, ?)").run(
      pool, round, attempt, entry.tgId, Date.now(), by,
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
export async function screen(pool) {
  const l = getLock(pool);
  const entries = l ? frozenEntries(l) : await liveEntries(pool);
  const ds = draws(pool);
  const out = new Set(ds.map((d) => d.tg_id));
  const prof = await profiles(entries.map((e) => e.tgId));
  const participants = entries.map((e) => {
    const p = prof.get(e.tgId);
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
  });
  return {
    pool,
    rounds: config.rounds[pool],
    locked: Boolean(l),
    seedHash: l?.commitment || "",
    participants,
    winners: ds.filter((d) => !d.voided).map((d) => ({ round: d.round, participantId: publicId(d.tg_id) })),
  };
}

/** For Maxim to contact the winners: full names, usernames, Telegram ids. Admin only. */
export async function winnersFull(pool) {
  const ds = draws(pool);
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

export function proof(pool) {
  const l = getLock(pool);
  if (!l) return null;
  return { pool, seed: l.seed, snapshotHash: l.snapshot_hash, commitment: l.commitment, snapshot: JSON.parse(l.snapshot), draws: draws(pool) };
}
