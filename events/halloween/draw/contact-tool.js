// «Написати переможцю», shared by the one-page screen (host.js) and the remote (pult.js).
// api is bound to the draw (pool) by the caller; test = rehearsal: the message goes to the admin.
// The filled template, editable, goes to the winner as a shop chat message
// (bot DM with a button into the chat; the answer comes to «Чати» in the admin panel).
export async function showContact({ api, dialog, esc, test }, round) {
  const pv = await api("/contact/preview", { method: "POST", body: JSON.stringify({ round, test }) });
  const who = `${esc(pv.to.name || "без імені")}${pv.to.username ? ` · <a href="https://t.me/${esc(pv.to.username)}" target="_blank" rel="noopener">@${esc(pv.to.username)}</a>` : ""}`;
  const el = dialog(
    `Написати переможцю раунду ${round}`,
    `<p>Кому: <b>${who}</b>${pv.prize ? ` · приз: <b>${esc(pv.prize.name)}</b>` : ' · <span class="warn">приз раунду не вибрано</span>'}</p>
    ${pv.test ? '<p class="warn">Тестовий режим: повідомлення прийде вам у чат магазину, а не цій людині.</p>' : ""}
    ${pv.sent ? `<p class="warn">Уже написано ${new Date(pv.sent.sentAt).toLocaleString("uk-UA")}. Ще одне повідомлення відкриє новий чат.</p>` : ""}
    <textarea rows="11" name="text">${esc(pv.text)}</textarea>
    <p class="muted">Людина отримає повідомлення від бота з кнопкою в чат. Відповідь прийде в адмінку → «Чати».</p>
    <button class="primary" data-send>Надіслати</button> <span data-res></span>`
  );
  const btn = el.querySelector("[data-send]");
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await api("/contact/send", { method: "POST", body: JSON.stringify({ round, test, text: el.querySelector("[name=text]").value }) });
      el.querySelector("[data-res]").innerHTML = `<span class="ok">Надіслано ✓</span>${r.threadId ? ` · <a href="/support?thread=${esc(r.threadId)}" target="_blank" rel="noopener">відкрити чат</a>` : ""}`;
    } catch (e) {
      btn.disabled = false;
      el.querySelector("[data-res]").innerHTML = `<span class="warn">${esc(e.message || e)}</span>`;
    }
  };
}
