// Broadcast results → the shop's users table (bot_blocked). Telegram refusing a message = the person
// blocked the bot (or deleted the account); a delivered one = they have not. The shop's own broadcasts
// skip blocked people and its «Пользователи» page shows them, so the event does not keep this to itself.
//
// Each sends row is copied once (bot_synced); a failed write stays unsynced and is retried by the next
// sync. Without the UPDATE grant (README) every write fails: one log line, the broadcast goes on.
import { db } from "./db.js";
import "./invites.js"; // creates the sends table
import { markBot } from "./shop.js";

db.exec(`CREATE TABLE IF NOT EXISTS bot_synced (campaign TEXT NOT NULL, tg_id TEXT NOT NULL, PRIMARY KEY (campaign, tg_id))`);

const pending = db.prepare(
  `SELECT s.campaign, s.tg_id, s.status, s.at FROM sends s
     LEFT JOIN bot_synced b ON b.campaign = s.campaign AND b.tg_id = s.tg_id
    WHERE b.tg_id IS NULL AND s.status IN ('ok', 'blocked')
    ORDER BY s.at`,
);
const done = db.prepare("INSERT OR IGNORE INTO bot_synced (campaign, tg_id) VALUES (?, ?)");

let warned = false;
let running = null;

/** Copy one result now (called right after a send). Never throws. */
export async function copy(campaign, tgId, status, at) {
  if (status !== "ok" && status !== "blocked") return;
  try {
    await markBot(tgId, status === "blocked", at);
    done.run(campaign, tgId);
  } catch (e) {
    if (!warned) console.error("[hw] bot status → shop failed (UPDATE grant on users?):", e.message);
    warned = true;
  }
}

/** Everything not copied yet (startup, and results from before this module existed). */
export function syncAll() {
  running ||= (async () => {
    const rows = pending.all();
    for (const r of rows) await copy(r.campaign, String(r.tg_id), r.status, Number(r.at));
    if (rows.length) console.log(`[hw] bot status → shop: ${rows.length} results`);
  })().finally(() => (running = null));
  return running;
}

export function unsynced() {
  return pending.all().length;
}
