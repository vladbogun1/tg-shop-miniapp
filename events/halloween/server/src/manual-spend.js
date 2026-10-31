// Money a person spent with the shop before its database existed — the owner knows it, the shop does not.
// Typed in the admin (participants page); it adds to the spend before the event, so the person can reach
// the earlier-customer threshold and is in the purchase draw like any earlier customer who joined.
import { db } from "./db.js";

db.exec(`CREATE TABLE IF NOT EXISTS manual_spend (
  tg_id       TEXT PRIMARY KEY,
  spend_minor INTEGER NOT NULL,
  note        TEXT,
  by          TEXT,
  at          INTEGER NOT NULL
)`);

const q = {
  all: db.prepare("SELECT tg_id, spend_minor FROM manual_spend"),
  put: db.prepare("INSERT OR REPLACE INTO manual_spend (tg_id, spend_minor, note, by, at) VALUES (?, ?, ?, ?, ?)"),
  del: db.prepare("DELETE FROM manual_spend WHERE tg_id = ?"),
};

/** tgId → minor units typed by hand. */
export function manualSpend() {
  return new Map(q.all.all().map((r) => [String(r.tg_id), Number(r.spend_minor)]));
}

export function setManual(tgId, spendMinor, note, by) {
  q.put.run(String(tgId), spendMinor, String(note || "").slice(0, 200), String(by || ""), Date.now());
}

export function removeManual(tgId) {
  return q.del.run(String(tgId)).changes > 0;
}

/**
 * Earlier customers: spend before the event from the shop plus what was typed by hand, kept when the
 * sum reaches `minMinor`. Pure, so the rule is tested without a database.
 */
export function earlierCustomers(shopBefore, manual, minMinor) {
  const out = new Map();
  for (const id of new Set([...shopBefore.keys(), ...manual.keys()])) {
    const spend = (shopBefore.get(id) || 0) + (manual.get(id) || 0);
    if (spend >= minMinor) out.set(id, spend);
  }
  return out;
}
