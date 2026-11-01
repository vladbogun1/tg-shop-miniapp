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
  pool     TEXT NOT NULL,
  round    INTEGER NOT NULL,
  prize_id INTEGER NOT NULL,
  PRIMARY KEY (pool, round)
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
// 01.11: photos of a pack for the remote's round cards (S3 keys of product photos or https links).
if (!db.prepare("SELECT name FROM pragma_table_info('prizes')").all().some((c) => c.name === "images")) {
  db.exec("ALTER TABLE prizes ADD COLUMN images TEXT NOT NULL DEFAULT '[]'");
}

// 01.11: the winner card goes straight from the bot (the support chat DM squashed it into a one-paragraph
// preview) and says how long we wait; a reroll edits it into "time is up" (contact.js).
if (!db.prepare("SELECT name FROM pragma_table_info('contacts')").all().some((c) => c.name === "tg_msg_id")) {
  db.exec("ALTER TABLE contacts ADD COLUMN tg_msg_id INTEGER");
  db.exec("ALTER TABLE contacts ADD COLUMN ref TEXT");
  db.exec("ALTER TABLE contacts ADD COLUMN expired_at INTEGER");
}

/** The template before 01.11: a saved copy of it counts as "not customised". */
const OLD_DEFAULT = `Привіт, {name}! 🎃

Ти виграв у Хелловін-розіграші ChiSetup на стрімі ({draw}, раунд {round}).
Твій приз: {prize}
{items}

Напиши тут, у цьому чаті, куди надіслати приз: ПІБ, телефон і місто з відділенням Нової пошти. Вітаємо!`;

export const DEFAULT_TEMPLATE = `🎃 {name}, вітаємо! Ти виграв!

Хелловін-розіграш ChiSetup на стрімі
{draw}, раунд {round}

🎁 Твій приз: {prize}
{items}

⏳ Відповідь чекаємо до {deadline} за Києвом ({minutes} хв). Якщо не встигнеш, приз розіграємо ще раз і він піде іншому учаснику.

✍️ Наступним повідомленням прийде чат підтримки з кнопкою «Відкрити переписку». Напиши туди:
• ПІБ
• телефон
• місто і відділення Нової пошти`;

/** Goes into the shop support chat: short, its bot DM shows it as a one-paragraph preview. */
export const CHAT_TEMPLATE =
  "🎃 Перемога в Хелловін-розіграші ({draw}, раунд {round}). Напиши сюди ПІБ, телефон, місто і відділення Нової пошти до {deadline} за Києвом.";

const q = {
  list: db.prepare("SELECT id, name, items, images FROM prizes ORDER BY id"),
  one: db.prepare("SELECT id, name, items, images FROM prizes WHERE id = ?"),
  insert: db.prepare("INSERT INTO prizes (name, items, images, created_at) VALUES (?, ?, ?, ?)"),
  update: db.prepare("UPDATE prizes SET name = ?, items = ?, images = ? WHERE id = ?"),
  remove: db.prepare("DELETE FROM prizes WHERE id = ?"),
  unassignPrize: db.prepare("DELETE FROM round_prizes WHERE prize_id = ?"),
  rounds: db.prepare("SELECT round, prize_id FROM round_prizes WHERE pool = ?"),
  assign: db.prepare("INSERT OR REPLACE INTO round_prizes (pool, round, prize_id) VALUES (?, ?, ?)"),
  unassign: db.prepare("DELETE FROM round_prizes WHERE pool = ? AND round = ?"),
  getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
  setSetting: db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"),
  contactsFor: db.prepare("SELECT draw_id, thread_id, sent_at FROM contacts WHERE draw_id IS NOT NULL ORDER BY id"),
  addContact: db.prepare("INSERT INTO contacts (draw_id, tg_id, thread_id, text, sent_at, sent_by, tg_msg_id, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
  liveFor: db.prepare("SELECT id, tg_id, thread_id, tg_msg_id FROM contacts WHERE ref = ? AND expired_at IS NULL"),
  expire: db.prepare("UPDATE contacts SET expired_at = ? WHERE id = ?"),
};

const row = (r) => (r ? { id: r.id, name: r.name, items: JSON.parse(r.items), images: JSON.parse(r.images || "[]") } : null);

/** A product photo key from the shop bucket (`products/…`, shown through /img), an https link, or `sets/<name>` —
 *  a whole pack drawn as one picture, shipped with this service (draw/assets/prizes/<name>.webp). */
export function cleanImages(images) {
  const list = Array.isArray(images) ? images : String(images || "").split("\n");
  return list
    .map((s) => String(s).trim())
    .filter((s) => /^products\/[\w./-]{1,200}$/.test(s) || /^https:\/\/[^\s"'<>]{1,400}$/.test(s) || /^sets\/[a-z0-9-]{1,60}$/.test(s))
    .slice(0, 6);
}

function cleanItems(items) {
  const list = Array.isArray(items) ? items : String(items || "").split("\n");
  return list.map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 20);
}

/** Draw names in the winner message and the support chat subject. */
export const DRAW_NAMES = { pumpkins: "розіграш за гарбузи", orders: "розіграш за покупки" };

/** Packs are shared; which pack each round plays for is per draw. */
export function state(pool) {
  const rounds = {};
  for (const r of q.rounds.all(pool)) rounds[r.round] = r.prize_id;
  return { pool, prizes: q.list.all().map(row), rounds, template: template() };
}

export function save(pool, b) {
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) throw new Error("Назва призу порожня");
  const items = JSON.stringify(cleanItems(b.items));
  const old = b.id ? q.one.get(Number(b.id)) : null;
  if (b.id && !old) throw new Error("Приз не знайдено");
  // Photos are optional in the request: the prize dialog without them keeps what is there.
  const images = b.images === undefined ? old?.images || "[]" : JSON.stringify(cleanImages(b.images));
  if (old) q.update.run(name, items, images, old.id);
  else q.insert.run(name, items, images, Date.now());
  return state(pool);
}

export function remove(pool, id) {
  q.unassignPrize.run(Number(id));
  q.remove.run(Number(id));
  return state(pool);
}

export function assign(pool, round, prizeId) {
  const r = Number(round);
  if (!(r >= 1 && r <= config.rounds[pool])) throw new Error("Немає такого раунду");
  if (prizeId) {
    if (!q.one.get(Number(prizeId))) throw new Error("Приз не знайдено");
    q.assign.run(pool, r, Number(prizeId));
  } else q.unassign.run(pool, r);
  return state(pool);
}

export function template() {
  const t = q.getSetting.get("template")?.value;
  return !t || t === OLD_DEFAULT ? DEFAULT_TEMPLATE : t;
}

export function setTemplate(pool, text) {
  const t = String(text || "").trim();
  if (t.length > 3000) throw new Error("Шаблон задовгий");
  q.setSetting.run("template", t || DEFAULT_TEMPLATE);
  return state(pool);
}

export function prizeFor(pool, round) {
  const id = q.rounds.all(pool).find((r) => r.round === Number(round))?.prize_id;
  const p = id ? row(q.one.get(id)) : null;
  return p ? { name: p.name, items: p.items } : null;
}

/** "21:47" in Kyiv. */
export function kyivTime(ms) {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}

/** deadline = { at: ms, minutes }: until when we wait for the winner's answer. */
export function render(tpl, { name, round, prize, pool, deadline }) {
  const items = prize?.items?.length ? prize.items.map((s) => `• ${s}`).join("\n") : "";
  // A customised template without the deadline still gets it: the winner has to know.
  const body = deadline && !tpl.includes("{deadline}")
    ? `${tpl}\n\n⏳ Відповідь чекаємо до {deadline} за Києвом ({minutes} хв). Якщо не встигнеш, приз розіграємо ще раз.`
    : tpl;
  return body
    .replaceAll("{name}", name || "друже")
    .replaceAll("{round}", String(round))
    .replaceAll("{draw}", DRAW_NAMES[pool] || "розіграш")
    .replaceAll("{prize}", prize?.name || "приз від ChiSetup")
    .replaceAll("{items}", items)
    .replaceAll("{deadline}", deadline ? kyivTime(deadline.at) : "")
    .replaceAll("{minutes}", deadline ? String(Math.round(deadline.minutes * 10) / 10).replace(".", ",") : "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** draw id → { threadId, sentAt } of the last message sent for that draw. */
export function contacted() {
  const m = new Map();
  for (const r of q.contactsFor.all()) m.set(r.draw_id, { threadId: r.thread_id, sentAt: new Date(Number(r.sent_at)).toISOString() });
  return m;
}

/** One row per winner card + support chat; ref = "live|test:<pool>:<round>", what a reroll looks up. */
export function addContact({ drawId, tgId, threadId, text, by, msgId, ref }) {
  q.addContact.run(drawId ?? null, String(tgId), threadId || null, text, Date.now(), by, msgId ?? null, ref);
}

/** The round's messages not voided yet, marked voided now (a reroll is drawing that round again). */
export function takeLive(ref) {
  const rows = q.liveFor.all(ref);
  for (const r of rows) q.expire.run(Date.now(), r.id);
  return rows;
}
