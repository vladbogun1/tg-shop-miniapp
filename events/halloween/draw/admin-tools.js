// «Учасники» dialog of the draw screen (admin only, never on the stream): live numbers of both draws,
// the people of the open draw with full names, exclude / return before the lock.
// Server side: server/src/admin-people.js, /hw/api/admin/{stats,people,exclude,include}.

const uah = (minor) => `${Math.round(Number(minor || 0) / 100).toLocaleString("uk-UA")} ₴`;

function summary(st, pool, people) {
  const p = st.pumpkins || {}, o = st.orders || {};
  let partial = "";
  if (pool === "pumpkins" && people.length) {
    const total = people.reduce((s, x) => s + x.tickets, 0);
    const part = people.filter((x) => x.pumpkins < 15).reduce((s, x) => s + x.tickets, 0);
    partial = ` · неповні разом: ${total ? Math.round((part / total) * 100) : 0} % шансу`;
  }
  const days = st.days || [];
  const today = days[days.length - 1];
  return `<p>🎃 За гарбузи: <b>${p.people ?? 0}</b> людей, повних наборів <b>${p.full ?? 0}</b>, квитків ${p.tickets ?? 0}${partial}<br>
    🛍 За покупки: <b>${o.people ?? 0}</b> людей, квитків ${o.tickets ?? 0}${
      today ? `<br><span class="muted">Сьогодні (${today.day}): зібрано ${today.collected} гарбузів, ${today.people} людей</span>` : ""
    }</p>`;
}

function rowHtml(x, pool, locked, esc) {
  const tg = x.username ? `<a href="https://t.me/${esc(x.username)}" target="_blank" rel="noopener">@${esc(x.username)}</a>` : esc(x.tgId);
  const score = pool === "pumpkins" ? `${x.pumpkins} 🎃` : `${uah(x.spendMinor)}${x.old ? " · старий покупець" : ""}`;
  return `<tr data-q="${esc(`${x.name || ""} ${x.username || ""} ${x.tgId}`.toLowerCase())}"><td>${esc(x.name || "—")}</td><td>${tg}</td><td>${score}</td><td>${x.tickets}</td><td>${
    locked ? "" : `<button data-ex="${esc(x.tgId)}">Виключити</button>`
  }</td></tr>`;
}

export async function showPeople({ api, dialog, fail, esc, pool, onChange }) {
  const [st, data] = await Promise.all([api("/stats"), api("/people")]);
  const { people, excluded, locked } = data;
  const head = `<tr><th>Імʼя</th><th>Telegram</th><th>${pool === "pumpkins" ? "Гарбузи" : "Сума"}</th><th>Квитки</th><th></th></tr>`;
  const html = `${summary(st, pool, people)}
    <p class="muted">${locked ? "Список зафіксовано — виключати вже не можна." : "Виключення діє в обох розіграшах, поки список не зафіксовано."}</p>
    <input id="pq" placeholder="Пошук: імʼя, @username або id" autocomplete="off" style="width:100%;margin:6px 0" />
    <table>${head}${people.map((x) => rowHtml(x, pool, locked, esc)).join("")}</table>
    ${excluded.length ? `<h4>Виключені</h4><table>${excluded
      .map((x) => `<tr><td>${esc(x.name || "—")}</td><td>${esc(x.username ? "@" + x.username : x.tgId)}</td><td>${esc(x.note)}</td><td>${
        locked ? "" : `<button data-in="${esc(x.tgId)}">Повернути</button>`
      }</td></tr>`)
      .join("")}</table>` : ""}`;
  const el = dialog(`Учасники · ${pool === "pumpkins" ? "за гарбузи" : "за покупки"} (не показувати на стрімі)`, html);
  el.querySelector("#pq").oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    el.querySelectorAll("tr[data-q]").forEach((tr) => (tr.hidden = Boolean(q) && !tr.dataset.q.includes(q)));
  };
  const act = async (path, body) => {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await onChange();
      await showPeople({ api, dialog, fail, esc, pool, onChange });
    } catch (e) { fail(e); }
  };
  el.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => {
    const note = prompt("Чому виключаємо? (скрипт, кілька акаунтів…)", "");
    if (note !== null) act("/exclude", { tgId: b.dataset.ex, note });
  }));
  el.querySelectorAll("[data-in]").forEach((b) => (b.onclick = () => act("/include", { tgId: b.dataset.in })));
}

/** Contacts table cell for a purchase-draw winner: red when refunds dropped the money below the threshold. */
export function spendCell(r, esc) {
  if (r.nowSpendMinor == null) return "";
  const low = Boolean(r.belowMin);
  const changed = r.lockedSpendMinor != null && r.nowSpendMinor !== r.lockedSpendMinor;
  return `<td class="${low ? "bad" : ""}" title="на момент фіксації: ${esc(uah(r.lockedSpendMinor))}">${uah(r.nowSpendMinor)}${
    changed ? ` (було ${uah(r.lockedSpendMinor)})` : ""
  }${low ? " ⚠ менше порогу — перевір замовлення" : ""}</td>`;
}
