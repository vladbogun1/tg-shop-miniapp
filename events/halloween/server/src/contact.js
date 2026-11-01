// «Написати переможцю» and what a reroll does to it. Two messages reach the winner:
//  1. the card (filled prize template) straight from the bot — blank lines kept, the deadline in it;
//  2. a short line in a new shop support chat (the bot DM «Відповідь підтримки» with «Відкрити переписку»),
//     where the winner answers and the admins see it in «Чати».
// A reroll of the round turns the card into "time is up" (edit, no notification) and posts the same into
// the chat (that one notifies), so the old winner is not left thinking the prize is coming.
import { config } from "./config.js";
import * as prizes from "./prizes.js";
import { snapshot } from "./show.js";

const TG_TIMEOUT_MS = 8_000;

const refOf = (test, pool, round) => `${test ? "test" : "live"}:${pool}:${round}`;

/** Until when the card says we wait: the stage countdown of this round if it runs, else replyMinutes from now. */
export function deadlineFor(pool, round, test) {
  const w = snapshot().wait;
  const now = Date.now();
  if (w && !w.answeredAt && w.pool === pool && w.test === Boolean(test) && w.round === Number(round) && w.endsAt > now) {
    return { at: w.endsAt, minutes: Math.max(0.5, Math.round((w.endsAt - now) / 30_000) / 2) };
  }
  return { at: now + config.replyMinutes * 60_000, minutes: config.replyMinutes };
}

async function tg(method, payload) {
  if (!config.botToken) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    const json = await r.json().catch(() => ({}));
    if (!json.ok) console.error(`[hw] contact ${method}: ${r.status} ${json.description || ""}`);
    return json.ok ? json.result : null;
  } catch (e) {
    console.error(`[hw] contact ${method}:`, e.message);
    return null;
  }
}

/** The shop backend as the admin calling us (it checks the token and signs the message with their name). */
async function backend(token, path, body) {
  const res = await fetch(`${config.backendUrl}/api/admin/support${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Чат не відкрився: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** text = the card the admin saw and maybe edited. Without a bot token the card goes into the chat as before. */
export async function send({ token, by, tgId, drawId, pool, round, test, text, deadline }) {
  const card = test ? `[ТЕСТ: справжньому переможцю це не пішло]\n\n${text}` : text;
  const sent = await tg("sendMessage", { chat_id: Number(tgId), text: card, disable_web_page_preview: true });
  const line = prizes.render(prizes.CHAT_TEMPLATE, { round, pool, deadline });
  const chatText = sent ? line : card;
  const t = await backend(token, "/threads", {
    userId: Number(tgId),
    subject: `Хелловін: ${prizes.DRAW_NAMES[pool] || "розіграш"}, раунд ${round}`,
    text: test && sent ? `[ТЕСТ] ${chatText}` : chatText,
  });
  prizes.addContact({ drawId: test ? null : drawId, tgId, threadId: t.id, text: card, by, msgId: sent?.message_id, ref: refOf(test, pool, round) });
  return { threadId: t.id || null, card: Boolean(sent) };
}

const EXPIRED = (round) =>
  `⌛ Час на відповідь вийшов, тому приз раунду ${round} розіграли ще раз і він дістанеться іншому учаснику.\n\nДякуємо, що був з нами на стрімі! 🎃`;

/** The round was rerolled: void what we sent its previous winner. Never fails the reroll itself. */
export async function expire({ token, pool, round, test }) {
  for (const c of prizes.takeLive(refOf(test, pool, round))) {
    if (c.tg_msg_id) await tg("editMessageText", { chat_id: Number(c.tg_id), message_id: c.tg_msg_id, text: EXPIRED(round) });
    if (c.thread_id) {
      await backend(token, `/threads/${encodeURIComponent(c.thread_id)}/messages`, { text: EXPIRED(round) })
        .catch((e) => console.error("[hw] contact expire chat:", e.message));
    }
  }
}
