// Bot DMs about the draws: "you are in", "full set — real chance", "you are in the purchase draw"
// and one reminder before the stream. Each (person, kind) is sent once; the table remembers it, so
// a restart does not repeat anything. Off unless HW_NOTIFY=1; HW_NOTIFY_ONLY limits it to test ids.
import { db } from "./db.js";
import { config } from "./config.js";
import { liveEntries } from "./pools.js";
import { profiles } from "./shop.js";

db.exec(`CREATE TABLE IF NOT EXISTS notified (
  tg_id TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL,
  PRIMARY KEY (tg_id, kind))`);

const TICK_MS = 60_000;
const PER_TICK = 300; // ~15 s of sending at the pause below
const PAUSE_MS = 50; // well under the bot's ~30 messages/s
const TIMEOUT_MS = 10_000;
const REMIND_BEFORE_MS = 60 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNotified = db.prepare("SELECT 1 FROM notified WHERE tg_id = ? AND kind = ?");
const markNotified = db.prepare("INSERT OR IGNORE INTO notified (tg_id, kind, at, ok) VALUES (?, ?, ?, ?)");

function langOf(p) {
  const l = String(p?.lang || "").toLowerCase();
  if (l.startsWith("ru")) return "ru";
  if (l.startsWith("en")) return "en";
  return "uk";
}

function streamTime() {
  const d = new Date(new Date(config.streamAt).getTime() + config.tzOffsetMinutes * 60_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const uah = (minor) => Math.round(minor / 100);

/** Message texts. `e` = the live entry (tickets, pumpkins, spendMinor). */
const TEXTS = {
  p1: {
    uk: (e) => `🎃 Ви знайшли першого гарбуза — і вже в розіграші за гарбузи!\n\nПоки шанс невеликий. Зберіть усі ${config.goal} (до ${config.dailyCap} на день) — і шанс виросте в рази.\n\nРозіграш наживо ${streamTime()} (Київ):`,
    ru: (e) => `🎃 Вы нашли первую тыкву — и уже в розыгрыше за тыквы!\n\nПока шанс небольшой. Соберите все ${config.goal} (до ${config.dailyCap} в день) — и шанс вырастет в разы.\n\nРозыгрыш вживую ${streamTime()} (Киев):`,
    en: (e) => `🎃 You found your first pumpkin — you're in the pumpkin draw!\n\nThe chance is small for now. Collect all ${config.goal} (up to ${config.dailyCap} a day) to multiply it.\n\nLive draw ${streamTime()} (Kyiv time):`,
  },
  pfull: {
    uk: () => `🎃🎃🎃 Усі ${config.goal} гарбузів зібрано! Тепер у вас повний шанс у розіграші за гарбузи.\n\nДивіться розіграш наживо ${streamTime()} (Київ):`,
    ru: () => `🎃🎃🎃 Все ${config.goal} тыкв собраны! Теперь у вас полный шанс в розыгрыше за тыквы.\n\nСмотрите розыгрыш вживую ${streamTime()} (Киев):`,
    en: () => `🎃🎃🎃 All ${config.goal} pumpkins collected! You now have the full chance in the pumpkin draw.\n\nWatch the live draw ${streamTime()} (Kyiv time):`,
  },
  o1: {
    uk: (e) => `🛍 Дякуємо за покупку! Ви в розіграші за покупки: ${e.tickets} квиток(ів) — по одному за кожні ${uah(config.minSpendMinor)} ₴.\n\nРозіграш наживо ${streamTime()} (Київ):`,
    ru: (e) => `🛍 Спасибо за покупку! Вы в розыгрыше за покупки: билетов — ${e.tickets}, по одному за каждые ${uah(config.minSpendMinor)} ₴.\n\nРозыгрыш вживую ${streamTime()} (Киев):`,
    en: (e) => `🛍 Thanks for your order! You're in the purchase draw with ${e.tickets} ticket(s) — one per ${uah(config.minSpendMinor)} UAH.\n\nLive draw ${streamTime()} (Kyiv time):`,
  },
  stream: {
    uk: () => `🔴 Через годину — розіграш наживо! Ви серед учасників. Заходьте:`,
    ru: () => `🔴 Через час — розыгрыш вживую! Вы среди участников. Заходите:`,
    en: () => `🔴 The live draw starts in an hour! You're taking part. Join us:`,
  },
};

function keyboard() {
  return { inline_keyboard: [config.streams.map((s) => ({ text: s.name, url: s.url }))] };
}

/** One DM. Returns "ok", "gone" (blocked / never started the bot — don't retry) or "retry". */
async function sendDm(tgId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: tgId, text, reply_markup: keyboard(), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.ok) return "ok";
    if (r.status === 429) {
      const j = await r.json().catch(() => ({}));
      return { retryAfter: Number(j?.parameters?.retry_after || 5) };
    }
    return r.status >= 400 && r.status < 500 ? "gone" : "retry";
  } catch {
    return "retry";
  }
}

/** Who should get which message right now: [{tgId, kind, entry}]. */
async function due(now) {
  const [pumpkins, orders] = await Promise.all([liveEntries("pumpkins"), liveEntries("orders")]);
  const out = [];
  for (const e of pumpkins) {
    out.push({ tgId: e.tgId, kind: "p1", entry: e });
    if (e.pumpkins >= config.goal) out.push({ tgId: e.tgId, kind: "pfull", entry: e });
  }
  for (const e of orders) out.push({ tgId: e.tgId, kind: "o1", entry: e });
  const streamMs = new Date(config.streamAt).getTime();
  if (now >= streamMs - REMIND_BEFORE_MS && now < streamMs) {
    for (const id of new Set([...pumpkins, ...orders].map((e) => e.tgId))) out.push({ tgId: id, kind: "stream", entry: null });
  }
  const only = config.notifyOnly.length ? new Set(config.notifyOnly) : null;
  // A full set arriving in the same tick as the first pumpkin: skip "p1", "pfull" says it all.
  const full = new Set(out.filter((x) => x.kind === "pfull").map((x) => x.tgId));
  return out.filter(
    (x) => (!only || only.has(x.tgId)) && !(x.kind === "p1" && full.has(x.tgId) && !isNotified.get(x.tgId, "p1")) && !isNotified.get(x.tgId, x.kind),
  );
}

let running = false;

export async function tick(now = Date.now()) {
  if (running) return;
  if (now < config.startsAt.getTime() || now > new Date(config.streamAt).getTime()) return;
  running = true;
  try {
    const list = (await due(now)).slice(0, PER_TICK);
    if (!list.length) return;
    const prof = await profiles([...new Set(list.map((x) => x.tgId))]);
    for (const x of list) {
      const text = TEXTS[x.kind][langOf(prof.get(x.tgId))](x.entry);
      const r = await sendDm(x.tgId, text);
      if (r === "ok" || r === "gone") markNotified.run(x.tgId, x.kind, Date.now(), r === "ok" ? 1 : 0);
      else if (r.retryAfter) {
        await sleep(r.retryAfter * 1000);
        break;
      }
      await sleep(PAUSE_MS);
    }
  } catch (e) {
    console.error("[hw] notify:", e.message);
  } finally {
    running = false;
  }
}

export function start() {
  if (!config.notify || !config.botToken) {
    console.log("[hw] notifications off (HW_NOTIFY / HW_BOT_TOKEN)");
    return;
  }
  console.log(`[hw] notifications on${config.notifyOnly.length ? ` only for ${config.notifyOnly.length} id(s)` : ""}`);
  setInterval(() => tick(), TICK_MS).unref();
  setTimeout(() => tick(), 5_000).unref();
}

export function stats() {
  const rows = db.prepare("SELECT kind, SUM(ok) AS sent, COUNT(*) - SUM(ok) AS failed FROM notified GROUP BY kind").all();
  return { on: config.notify && Boolean(config.botToken), byKind: Object.fromEntries(rows.map((r) => [r.kind, { sent: Number(r.sent), failed: Number(r.failed) }])) };
}
