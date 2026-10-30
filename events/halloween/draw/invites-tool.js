// «Розсилка» dialog (admin only, never on the stream): earlier customers invited to the purchase draw,
// who pressed «Участвовать», who only got the message (grey), whom Telegram refused (blocked the bot),
// and the two broadcasts with a test to yourself first.
// Server side: server/src/invites.js, broadcast.js, /hw/api/admin/{invites,broadcast/*}.

const uah = (minor) => `${Math.round(Number(minor || 0) / 100).toLocaleString("uk-UA")} ₴`;
const when = (ms) => (ms ? new Date(ms).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

const STATES = {
  joined: ["✅ Бере участь", "ok"],
  grey: ["⚪ Отримав, не натиснув", "muted"],
  "not-sent": ["… Ще не розсилали", "muted"],
  blocked: ["⛔ Заблокував бота", "bad"],
  error: ["⚠ Помилка відправки", "bad"],
};

function csv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["tg_id", "name", "username", "old_spend_uah", "state", "sent_at", "joined_at"].join(",")];
  for (const r of rows) lines.push([r.tgId, r.name, r.username, Math.round(r.oldSpendMinor / 100), r.state, when(r.sentAt), when(r.joinedAt)].map(q).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  a.download = "halloween-old-customers.csv";
  a.click();
}

function jobLine(st) {
  const j = st.job;
  if (!j) return "";
  const name = j.campaign === "old" ? "старим покупцям" : "всім іншим";
  return `<p><b>Розсилка ${name}:</b> ${j.done} з ${j.total} · доставлено ${j.ok} · заблокували ${j.blocked} · помилки ${j.error}${
    j.finishedAt ? " · завершено" : " · йде…"
  }</p>`;
}

export async function showInvites({ api, dialog, fail, esc }) {
  const [inv, st] = await Promise.all([api("/invites"), api("/broadcast/status")]);
  const o = inv.old;
  const filterBtn = (k, label, n) => `<button data-f="${k}">${label}: ${n}</button>`;
  const rowHtml = (r) => {
    const [label, cls] = STATES[r.state];
    const tg = r.username ? `<a href="https://t.me/${esc(r.username)}" target="_blank" rel="noopener">@${esc(r.username)}</a>` : esc(r.tgId);
    return `<tr data-s="${r.state}" data-q="${esc(`${r.name || ""} ${r.username || ""} ${r.tgId}`.toLowerCase())}"><td>${esc(r.name || "—")}</td><td>${tg}</td><td>${uah(
      r.oldSpendMinor,
    )}</td><td class="${cls}">${label}</td><td>${esc(when(r.joinedAt || r.sentAt))}</td></tr>`;
  };
  const html = `
    <p>Старі покупці (від ${uah(inv.oldMinSpendMinor)} до акції): <b>${o.total}</b>.
      Натиснули «Участвовать» і в розіграші за покупки (${inv.oldTickets} квиток + нові замовлення): <b>${o.joined}</b>.
      Отримали, але не натиснули (сірі): <b>${o.grey}</b>. Заблокували бота: <b>${o.blocked}</b>. Ще не розсилали: <b>${o.notSent}</b>.</p>
    <p>Всім іншим: доставлено ${inv.rest.sent}, заблокували ${inv.rest.blocked}, помилки ${inv.rest.error}.</p>
    ${jobLine(st)}
    <p class="muted">${st.botToken ? "" : "⚠ Немає токена бота — розсилка неможлива. "}${st.only ? `Обмеження: шле тільки ${st.only} тестовим id (HW_NOTIFY_ONLY). ` : ""}Кожному розсилка йде один раз.</p>
    <div class="row">
      <button id="bt-test">Тест мені: обидва варіанти</button>
      <button id="bt-old">Розіслати старим (${st.left.old})</button>
      <button id="bt-rest">Розіслати всім іншим (${st.left.rest})</button>
      <button id="bt-csv">CSV</button>
    </div>
    <div class="row">${filterBtn("", "Усі", o.total)}${filterBtn("joined", "Беруть участь", o.joined)}${filterBtn("grey", "Сірі", o.grey)}${filterBtn("blocked", "Заблокували", o.blocked)}${filterBtn("not-sent", "Не розсилали", o.notSent)}</div>
    <input id="iq" placeholder="Пошук: імʼя, @username або id" autocomplete="off" style="width:100%;margin:6px 0" />
    <table><tr><th>Імʼя</th><th>Telegram</th><th>Купив раніше</th><th>Статус</th><th>Коли</th></tr>${inv.rows.map(rowHtml).join("")}</table>`;
  const el = dialog("Розсилка і старі покупці (не показувати на стрімі)", html);
  let f = "", q = "";
  const apply = () => el.querySelectorAll("tr[data-s]").forEach((tr) => (tr.hidden = (f && tr.dataset.s !== f) || (q && !tr.dataset.q.includes(q))));
  el.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { f = b.dataset.f; apply(); }));
  el.querySelector("#iq").oninput = (e) => { q = e.target.value.trim().toLowerCase(); apply(); };
  el.querySelector("#bt-csv").onclick = () => csv(inv.rows);
  el.querySelector("#bt-test").onclick = async () => {
    try {
      const r = await api("/broadcast/test", { method: "POST", body: JSON.stringify({}) });
      alert(`Надіслано тобі (${r.lang}): старим — ${r.result.old}, іншим — ${r.result.rest}`);
    } catch (e) { fail(e); }
  };
  const start = async (campaign, left, who) => {
    if (!left) return alert("Нікому слати: всім уже відправлено");
    const typed = prompt(`Розіслати ${who}: ${left} людей. Це піде справжнім людям. Щоб підтвердити, введи число ${left}`);
    if (typed === null) return;
    try {
      await api("/broadcast/start", { method: "POST", body: JSON.stringify({ campaign, confirm: Number(typed) }) });
      await showInvites({ api, dialog, fail, esc });
    } catch (e) { fail(e); }
  };
  el.querySelector("#bt-old").onclick = () => start("old", st.left.old, "старим покупцям");
  el.querySelector("#bt-rest").onclick = () => start("rest", st.left.rest, "всім іншим");
  if (st.job && !st.job.finishedAt) setTimeout(() => el.isConnected && el.closest("dialog")?.open && showInvites({ api, dialog, fail, esc }).catch(fail), 3000);
}
