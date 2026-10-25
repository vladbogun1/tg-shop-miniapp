// Prize packs for the stream draw and the message the winner gets. Maxim makes the packs before the
// stream and picks which pack each round plays for; the visual shows it, and «Написати переможцю»
// sends the filled template through the shop's support chat (the customer gets a bot DM with a
// button into the chat, the answer lands in the admin's «Чати»).
import { db } from "./db.js";
import { config } from "./config.js";

db.exec(`
CREATE TABLE IF NOT EXISTS prizes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  items      TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS round_prizes (
  round    INTEGER PRIMARY KEY,
  prize_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- One row per message sent to a winner (draws.id; a rehearsal message has none).
CREATE TABLE IF NOT EXISTS contacts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_id   INTEGER,
  tg_id     TEXT NOT NULL,
  thread_id TEXT,
  text      TEXT NOT NULL,
  sent_at   INTEGER NOT NULL,
  sent_by   TEXT
);
`);

export const DEFAULT_TEMPLATE = `Привіт, {name}! 🎃

Ти виграв у Хелловін-розіграші ChiSetup на стрімі (раунд {round}).
Твій приз: {prize}
{items}

Напиши тут, у цьому чаті, куди надіслати приз: ПІБ, телефон і місто з відділенням Нової пошти. Вітаємо!`;

const q = {
  list: db.prepare("SELECT id, name, items FROM prizes ORDER BY id"),
  one: db.prepare("SELECT id, name, items FROM prizes WHERE id = ?"),
  insert: db.prepare("INSERT INTO prizes (name, items, created_at) VALUES (?, ?, ?)"),
  update: db.prepare("UPDATE prizes SET name = ?, items = ? WHERE id = ?"),
  remove: db.prepare("DELETE FROM prizes WHERE id = ?"),
  unassignPrize: db.prepare("DELETE FROM round_prizes WHERE prize_id = ?"),
  rounds: db.prepare("SELECT round, prize_id FROM round_prizes"),
  assign: db.prepare("INSERT OR REPLACE INTO round_prizes (round, prize_id) VALUES (?, ?)"),
  unassign: db.prepare("DELETE FROM round_prizes WHERE round = ?"),
  getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
  setSetting: db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"),
  contactsFor: db.prepare("SELECT draw_id, thread_id, sent_at FROM contacts WHERE draw_id IS NOT NULL ORDER BY id"),
  addContact: db.prepare("INSERT INTO contacts (draw_id, tg_id, thread_id, text, sent_at, sent_by) VALUES (?, ?, ?, ?, ?, ?)"),
};

const row = (r) => (r ? { id: r.id, name: r.name, items: JSON.parse(r.items) } : null);

function cleanItems(items) {
  const list = Array.isArray(items) ? items : String(items || "").split("\n");
  return list.map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 20);
}

export function state() {
  const rounds = {};
  for (const r of q.rounds.all()) rounds[r.round] = r.prize_id;
  return { prizes: q.list.all().map(row), rounds, template: template() };
}

export function save(b) {
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) throw new Error("Назва призу порожня");
  const items = JSON.stringify(cleanItems(b.items));
  if (b.id) {
    if (!q.one.get(Number(b.id))) throw new Error("Приз не знайдено");
    q.update.run(name, items, Number(b.id));
  } else q.insert.run(name, items, Date.now());
  return state();
}

export function remove(id) {
  q.unassignPrize.run(Number(id));
  q.remove.run(Number(id));
  return state();
}

export function assign(round, prizeId) {
  const r = Number(round);
  if (!(r >= 1 && r <= config.rounds)) throw new Error("Немає такого раунду");
  if (prizeId) {
    if (!q.one.get(Number(prizeId))) throw new Error("Приз не знайдено");
    q.assign.run(r, Number(prizeId));
  } else q.unassign.run(r);
  return state();
}

export function template() {
  return q.getSetting.get("template")?.value || DEFAULT_TEMPLATE;
}

export function setTemplate(text) {
  const t = String(text || "").trim();
  if (t.length > 3000) throw new Error("Шаблон задовгий");
  q.setSetting.run("template", t || DEFAULT_TEMPLATE);
  return state();
}

export function prizeFor(round) {
  const id = q.rounds.all().find((r) => r.round === Number(round))?.prize_id;
  const p = id ? row(q.one.get(id)) : null;
  return p ? { name: p.name, items: p.items } : null;
}

export function render(tpl, { name, round, prize }) {
  const items = prize?.items?.length ? prize.items.map((s) => `• ${s}`).join("\n") : "";
  return tpl
    .replaceAll("{name}", name || "друже")
    .replaceAll("{round}", String(round))
    .replaceAll("{prize}", prize?.name || "приз від ChiSetup")
    .replaceAll("{items}", items)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** draw id → { threadId, sentAt } of the last message sent for that draw. */
export function contacted() {
  const m = new Map();
  for (const r of q.contactsFor.all()) m.set(r.draw_id, { threadId: r.thread_id, sentAt: new Date(Number(r.sent_at)).toISOString() });
  return m;
}

/**
 * Opens a support chat with the customer and posts the text there, as the admin calling us (their
 * token goes on to the shop backend, which checks it and writes the admin's name on the message).
 */
export async function send({ token, by, tgId, drawId, round, text }) {
  const res = await fetch(`${config.backendUrl}/api/admin/support/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: Number(tgId), subject: `Хелловін: виграш у раунді ${round}`, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Чат не відкрився: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const t = await res.json();
  q.addContact.run(drawId ?? null, String(tgId), t.id || null, text, Date.now(), by);
  return { threadId: t.id || null };
}
