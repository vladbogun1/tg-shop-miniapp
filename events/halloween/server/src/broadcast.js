// The 30.10 broadcast, started by hand from the admin «Розсилка» dialog (never by itself):
//   old  — earlier customers (invites.js): purchase draw + «Участвовать», then the pumpkin hunt;
//   rest — everyone else with a Telegram id: the purchase draw + «В магазин», then the pumpkin hunt.
// Each person is tried once per campaign (the sends table), so a restart continues where it stopped.
// Telegram refusing the first message (blocked / never started the bot) = "blocked", the second is skipped.
// Every result also goes to the shop's users.bot_blocked (bot-status.js).
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { db } from "./db.js";
import { config } from "./config.js";
import { shopFacts, profiles, allCustomerIds } from "./shop.js";
import { excludedIds } from "./pools.js";
import { joinLink, sendsOf, isJoined } from "./invites.js";
import { TEXTS, BUTTONS } from "./broadcast-texts.js";
import * as botStatus from "./bot-status.js";

db.exec(`CREATE TABLE IF NOT EXISTS media_ids (path TEXT PRIMARY KEY, stamp TEXT NOT NULL, file_id TEXT NOT NULL)`);

const PAUSE_MS = 60; // two messages per person: well under the bot's ~30 messages/s
const TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const EXTS = [".mp4", ".gif", ".jpg", ".png"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const record = db.prepare("INSERT OR IGNORE INTO sends (campaign, tg_id, status, at) VALUES (?, ?, ?, ?)");
const cachedMedia = db.prepare("SELECT stamp, file_id FROM media_ids WHERE path = ?");
const saveMedia = db.prepare("INSERT OR REPLACE INTO media_ids (path, stamp, file_id) VALUES (?, ?, ?)");

export function langOf(p) {
  const l = String(p?.lang || "").toLowerCase();
  if (l.startsWith("ru")) return "ru";
  if (l.startsWith("en")) return "en";
  return "uk";
}

async function mediaFile(lang, name) {
  if (!config.mediaDir) return null;
  for (const l of [lang, "uk", "ru"]) {
    for (const ext of EXTS) {
      const path = join(config.mediaDir, l, name + ext);
      try {
        const s = await stat(path);
        return { path, stamp: `${s.size}:${s.mtimeMs}` };
      } catch { /* next */ }
    }
  }
  return null;
}

/** Telegram call; returns { ok, json, status }. */
async function call(method, payload, timeout = TIMEOUT_MS) {
  const isForm = payload instanceof FormData;
  const r = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "content-type": "application/json" },
    body: isForm ? payload : JSON.stringify(payload),
    signal: AbortSignal.timeout(timeout),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok && json.ok, json, status: r.status };
}

/**
 * One message with a picture (animation for mp4/gif). The first upload goes as a file, after that
 * Telegram's file_id is reused, so 2000 people do not upload the same video 2000 times.
 */
async function sendOne(chatId, caption, button, lang, media) {
  const markup = { inline_keyboard: [[button]] };
  const file = await mediaFile(lang, media);
  if (!file) return call("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", reply_markup: markup, disable_web_page_preview: true });
  const animated = [".mp4", ".gif"].includes(extname(file.path));
  const [method, field] = animated ? ["sendAnimation", "animation"] : ["sendPhoto", "photo"];
  const hit = cachedMedia.get(file.path);
  if (hit && hit.stamp === file.stamp) {
    return call(method, { chat_id: chatId, [field]: hit.file_id, caption, parse_mode: "HTML", reply_markup: markup });
  }
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  form.set("reply_markup", JSON.stringify(markup));
  form.set(field, new Blob([await readFile(file.path)]), file.path.split(/[\\/]/).pop());
  const r = await call(method, form, UPLOAD_TIMEOUT_MS);
  const res = r.json?.result;
  const id = animated ? (res?.animation || res?.document || res?.video)?.file_id : res?.photo?.at(-1)?.file_id;
  if (r.ok && id) saveMedia.run(file.path, file.stamp, id);
  return r;
}

const webApp = (text) => ({ text, web_app: { url: config.appUrl } });

/** The two messages of a campaign for one person. */
function messages(campaign, tgId, lang) {
  return campaign === "old"
    ? [
        { text: TEXTS.oldOrders[lang](), button: { text: BUTTONS.join[lang], url: joinLink(tgId, lang) }, media: "orders" },
        { text: TEXTS.oldPumpkins[lang](), button: webApp(BUTTONS.hunt[lang]), media: "pumpkins" },
      ]
    : [
        { text: TEXTS.restOrders[lang](), button: webApp(BUTTONS.shop[lang]), media: "orders" },
        { text: TEXTS.restPumpkins[lang](), button: webApp(BUTTONS.hunt[lang]), media: "pumpkins" },
      ];
}

/** One message, waiting out Telegram's "too many requests" (a few times at most). */
async function sendPatiently(tgId, m, lang) {
  for (let i = 0; ; i++) {
    const r = await sendOne(tgId, m.text, m.button, lang, m.media);
    if (r.status !== 429 || i >= 3) return r;
    await sleep(Number(r.json?.parameters?.retry_after || 5) * 1000);
  }
}

/** "ok" | "blocked" | "error" (about the first message: it decides whether the person got the invite). */
async function deliver(campaign, tgId, lang) {
  let first = true;
  for (const m of messages(campaign, tgId, lang)) {
    let r;
    try {
      r = await sendPatiently(tgId, m, lang);
    } catch {
      return first ? "error" : "ok";
    }
    if (!r.ok) {
      const desc = String(r.json?.description || "");
      const gone = r.status === 403 || /chat not found|user is deactivated|bot was blocked/i.test(desc);
      if (first) return gone ? "blocked" : "error";
      return "ok";
    }
    first = false;
    await sleep(PAUSE_MS);
  }
  return "ok";
}

/** Test: both variants or one, to one admin, nothing recorded. */
export async function test(tgId, campaigns = ["old", "rest"]) {
  if (!config.botToken) throw new Error("Немає HW_BOT_TOKEN");
  const lang = langOf((await profiles([String(tgId)])).get(String(tgId)));
  const out = {};
  for (const c of campaigns) {
    out[c] = await deliver(c, String(tgId), lang);
    await sleep(500);
  }
  return { lang, result: out };
}

/** Who a campaign would still write to (already tried, staff and excluded people are left out). */
export async function audience(campaign) {
  const facts = await shopFacts();
  const skip = await excludedIds();
  const done = sendsOf(campaign);
  const ids = campaign === "old" ? [...facts.old.keys()] : (await allCustomerIds()).filter((id) => !facts.old.has(id));
  const only = config.notifyOnly.length ? new Set(config.notifyOnly) : null;
  // Someone already in (added by hand in the admin) needs no invite.
  return ids.filter((id) => !skip.has(id) && !done.has(id) && (!only || only.has(id)) && !(campaign === "old" && isJoined(id)));
}

let job = null; // { campaign, total, done, ok, blocked, error, startedAt, finishedAt }

export function status() {
  return job;
}

export async function start(campaign) {
  if (!["old", "rest"].includes(campaign)) throw new Error("Немає такої розсилки");
  if (!config.botToken) throw new Error("Немає HW_BOT_TOKEN");
  if (job && !job.finishedAt) throw new Error("Розсилка вже йде");
  const ids = await audience(campaign);
  job = { campaign, total: ids.length, done: 0, ok: 0, blocked: 0, error: 0, startedAt: Date.now(), finishedAt: null };
  run(campaign, ids, job).catch((e) => console.error("[hw] broadcast:", e.message));
  return job;
}

async function run(campaign, ids, j) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const prof = await profiles(chunk);
    for (const id of chunk) {
      const r = await deliver(campaign, id, langOf(prof.get(id)));
      const at = Date.now();
      record.run(campaign, id, r, at);
      await botStatus.copy(campaign, id, r, at);
      j[r] += 1;
      j.done += 1;
      await sleep(PAUSE_MS);
    }
  }
  j.finishedAt = Date.now();
  console.log(`[hw] broadcast ${campaign}: ${j.ok} ok, ${j.blocked} blocked, ${j.error} error`);
}
