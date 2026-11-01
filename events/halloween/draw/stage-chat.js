// The chat window on the «Чекаємо відповідь» screen (stage-wait.js), in every visual: the card the bot sent
// the winner, as the winner sees it in Telegram, then «+» when Maxim marks the answer, or «time is up».
// Before the card goes out it shows Maxim typing. Data: `wait.chat` of the show state ({ text, sentAt },
// server/src/contact.js cardFor) — the name in the card is the masked one the scene shows anyway.
import { t } from "./lang.js";
import { el } from "./stage-common.js";

const kyivTime = (ms) =>
  new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

function dots() {
  const d = el("span", "c-dots");
  d.append(el("i"), el("i"), el("i"));
  return d;
}

function bubble(side, text, time) {
  const b = el("div", `c-msg ${side}`);
  // paragraphs with a small gap instead of the empty lines: the whole card fits the window
  const body = el("div", "c-text");
  for (const p of text.split(/\n\s*\n/)) body.append(el("p", "", p.trim()));
  b.append(body);
  if (time) b.append(el("div", "c-time", time));
  return b;
}

/** name — the winner as the scene shows them. Redraws only when the card or the state changed. */
export function makeChat(name) {
  const root = el("div", "w-chat px");
  const head = el("div", "c-head");
  const ava = el("div", "c-ava", "🎃");
  const who = el("div", "c-who");
  who.append(el("div", "c-bot", "ChiSetup"), el("div", "c-to", `→ ${name}`));
  head.append(ava, who, el("div", "c-tg", "Telegram"));
  const feed = el("div", "c-feed");
  const foot = el("div", "c-foot");
  root.append(head, feed, foot);
  let drawn = "";

  return {
    el: root,
    /** st: running / hurry / over / answered (stage-wait.js) */
    set(chat, st, answeredAt) {
      const key = `${chat?.sentAt ?? 0}|${st === "hurry" ? "running" : st}`;
      if (key === drawn) return;
      drawn = key;
      feed.innerHTML = "";
      foot.innerHTML = "";
      if (!chat) {
        const typing = el("div", "c-msg bot c-typing");
        typing.append(el("span", "c-text", t("Максим пише", "Максим пишет")), dots());
        feed.append(typing);
        foot.append(el("span", "", t("Повідомлення переможцю ось-ось прийде", "Сообщение победителю вот-вот придёт")));
        return;
      }
      feed.append(bubble("bot", chat.text, `${kyivTime(chat.sentAt)} ✓✓`));
      if (st === "answered") {
        feed.append(bubble("me", "+", answeredAt ? kyivTime(answeredAt) : ""));
        foot.append(el("span", "c-ok", t("Переможець відповів!", "Победитель ответил!")));
      } else if (st === "over") {
        feed.append(el("div", "c-sys", t("⌛ Час на відповідь вийшов", "⌛ Время на ответ вышло")));
        foot.append(el("span", "c-late", t("Відповіді немає", "Ответа нет")));
      } else {
        foot.append(el("span", "", t("Чекаємо «+» від переможця", "Ждём «+» от победителя")), dots());
      }
    },
  };
}
