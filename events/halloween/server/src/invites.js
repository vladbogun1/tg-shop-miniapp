// Earlier customers (added 30.10): people who bought for config.oldMinSpend before the event are
// invited by the bot. Delivered and not pressed yet = "grey"; pressed «Участвовать» = in the purchase
// draw. Telegram refusing the message (bot blocked) = not recorded anywhere: they never saw the invite.
//
//   sends  — one row per (campaign, person) the broadcast tried: ok / blocked / error. Never sent twice.
//   joined — who pressed the button (from the bot link, or from the progress panel when signed in).
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import { shopFacts } from "./shop.js";

db.exec(`
CREATE TABLE IF NOT EXISTS sends (
  campaign TEXT NOT NULL,
  tg_id    TEXT NOT NULL,
  status   TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (campaign, tg_id)
);
CREATE TABLE IF NOT EXISTS joined (
  tg_id TEXT PRIMARY KEY,
  at    INTEGER NOT NULL,
  via   TEXT NOT NULL
);`);

const key = Buffer.from(`hw-join:${config.jwtSecret || "dev"}`);

/** Signature of the personal «Участвовать» link: whoever has the link joins its owner, nobody else. */
export function joinSig(tgId) {
  return createHmac("sha256", key).update(String(tgId)).digest("base64url").slice(0, 22);
}

export function joinLink(tgId, lang) {
  return `${config.siteUrl}/hw/join/?u=${tgId}&s=${joinSig(tgId)}&l=${lang}`;
}

export function checkSig(tgId, sig) {
  if (!/^\d+$/.test(String(tgId || "")) || typeof sig !== "string") return false;
  const a = Buffer.from(sig), b = Buffer.from(joinSig(tgId));
  return a.length === b.length && timingSafeEqual(a, b);
}

const q = {
  joined: db.prepare("SELECT tg_id, at, via FROM joined"),
  isJoined: db.prepare("SELECT at FROM joined WHERE tg_id = ?"),
  join: db.prepare("INSERT OR IGNORE INTO joined (tg_id, at, via) VALUES (?, ?, ?)"),
  unjoinAdmin: db.prepare("DELETE FROM joined WHERE tg_id = ? AND via = 'admin'"),
  sends: db.prepare("SELECT tg_id, status, at FROM sends WHERE campaign = ?"),
};

/** tgId → joined-at, only for people still on the earlier-customers list. */
export async function joinedOld() {
  const { old } = await shopFacts();
  const m = new Map();
  for (const r of q.joined.all()) if (old.has(String(r.tg_id))) m.set(String(r.tg_id), Number(r.at));
  return m;
}

export function isJoined(tgId) {
  return Boolean(q.isJoined.get(String(tgId)));
}

export async function isOld(tgId) {
  return (await shopFacts()).old.has(String(tgId));
}

/**
 * Press «Участвовать». Only for earlier customers, only until the hunt ends (the list is frozen
 * after that). Pressing twice is fine.
 */
export async function join(tgId, via, { locked }) {
  if (!(await isOld(tgId))) return { ok: false, reason: "not-old" };
  if (Date.now() > config.endsAt.getTime() || locked) return { ok: false, reason: "closed" };
  q.join.run(String(tgId), Date.now(), via);
  return { ok: true };
}

/** Added by hand in the admin (manual-spend.js): in without pressing anything. */
export function joinByAdmin(tgId) {
  q.join.run(String(tgId), Date.now(), "admin");
}

/** Undo of joinByAdmin; someone who pressed the button themselves stays in. */
export function unjoinAdmin(tgId) {
  q.unjoinAdmin.run(String(tgId));
}

export function sendsOf(campaign) {
  return new Map(q.sends.all(campaign).map((r) => [String(r.tg_id), { status: r.status, at: Number(r.at) }]));
}

/** The «Розсилка» numbers and the earlier-customers table for the admin. */
export async function overview() {
  const { old } = await shopFacts();
  const sent = sendsOf("old");
  const joined = new Map(q.joined.all().map((r) => [String(r.tg_id), r]));
  const rows = [...old].map(([tgId, spend]) => {
    const s = sent.get(tgId);
    const j = joined.get(tgId);
    const state = j ? "joined" : !s ? "not-sent" : s.status === "ok" ? "grey" : s.status === "blocked" ? "blocked" : "error";
    return { tgId, oldSpendMinor: spend, state, sentAt: s?.at || null, joinedAt: j ? Number(j.at) : null, via: j?.via || null };
  });
  const count = (st) => rows.filter((r) => r.state === st).length;
  const rest = [...sendsOf("rest").values()];
  return {
    old: { total: rows.length, joined: count("joined"), grey: count("grey"), blocked: count("blocked"), error: count("error"), notSent: count("not-sent") },
    rest: { sent: rest.filter((r) => r.status === "ok").length, blocked: rest.filter((r) => r.status === "blocked").length, error: rest.filter((r) => r.status === "error").length },
    rows,
  };
}
