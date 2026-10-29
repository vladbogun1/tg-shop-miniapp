// Host of the stream draw screen: loads participants, asks the server for a winner, lets the
// chosen visual animate to it. See VISUAL-CONTRACT.md.
import { VISUALS } from "./visuals/registry.js";
import { mockParticipants, mockDraw } from "./mock.js";

const qs = new URLSearchParams(location.search);
const MOCK = qs.has("mock") ? Number(qs.get("mock")) || 120 : 0;
// Two separate draws (server/src/pools.js): the screen plays one of them, picked in the panel.
const POOL = qs.get("pool") === "orders" ? "orders" : "pumpkins";
let ROUNDS = 3; // from the server
const API = "/hw/api/admin";
// Rehearsal: random real customers from the shop database play with made-up tickets; the real list,
// lock and rounds are not touched (server/src/test-draw.js).
const TEST = !MOCK && qs.get("test") === "1";
const P = TEST ? "/test" : "";
const TOKEN_KEY = "tgshop_admin_jwt"; // the admin panel's token, same origin

const $ = (id) => document.getElementById(id);
const stage = $("stage");
// prizes: { prizes: [{id, name, items}], rounds: {round: prizeId}, template } — see server/src/prizes.js
const state = { participants: [], winners: [], seedHash: "", locked: false, visual: null, rolling: false, prizes: { prizes: [], rounds: {}, template: "" } };
const prefs = { avatars: true, sound: true };

// ---------- sound (synthesised, no files) ----------
let audio;
function sound(name) {
  if (!prefs.sound) return;
  audio ??= new AudioContext();
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.connect(g).connect(audio.destination);
  const env = (a, d, peak = 0.25) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  switch (name) {
    case "tick": o.type = "square"; o.frequency.setValueAtTime(1400, t); env(0.002, 0.04, 0.08); break;
    case "whoosh": o.type = "sawtooth"; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35); env(0.05, 0.35, 0.08); break;
    case "drum": o.type = "triangle"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2); env(0.005, 0.25, 0.5); break;
    case "boom": o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8); env(0.01, 0.9, 0.7); break;
    case "win": o.type = "triangle"; [523, 659, 784, 1046].forEach((f, i) => o.frequency.setValueAtTime(f, t + i * 0.12)); env(0.01, 0.8, 0.25); break;
    default: o.frequency.setValueAtTime(600, t); env(0.01, 0.1, 0.1);
  }
  o.start(t);
  o.stop(t + 1.2);
}

// ---------- server ----------
async function api(path, init = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(API + path + (path.includes("?") ? "&" : "?") + "pool=" + POOL, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 401 || res.status === 403) throw new Error("Увійдіть в адмінку на цьому домені й оновіть сторінку");
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

async function load() {
  if (MOCK) {
    state.participants = mockParticipants(MOCK);
    state.seedHash = "mock";
    return;
  }
  const [data, pz] = await Promise.all([api(P + "/participants"), api("/prizes")]);
  state.prizes = pz;
  state.participants = data.participants; // `won` comes from the server: voided winners stay out too
  state.winners = data.winners; // [{round, participantId}], live (not voided) draws only
  state.seedHash = data.seedHash;
  state.locked = data.locked;
  if (data.rounds) ROUNDS = data.rounds;
}

async function draw(reroll) {
  if (MOCK) {
    if (reroll && state.winners.length) {
      state.winners.pop();
    }
    const { winner, totalTickets } = mockDraw(state.participants);
    return { winner, round: state.winners.length + 1, totalTickets };
  }
  return api(P + (reroll ? "/reroll" : "/draw"), { method: "POST", body: "{}" });
}

// ---------- ui ----------
// Mock mode only: the server marks `won` itself (including winners of voided rounds).
function markWon() {
  if (!MOCK) return;
  const ids = new Set(state.winners.map((w) => w.participantId));
  for (const p of state.participants) p.won = ids.has(p.id);
}

function renderRail() {
  const rail = $("rail");
  rail.innerHTML = "";
  for (let r = 1; r <= ROUNDS; r++) {
    const w = state.winners.find((x) => x.round === r);
    const p = w && state.participants.find((x) => x.id === w.participantId);
    const el = document.createElement("div");
    el.className = "slot" + (p ? "" : " empty");
    el.innerHTML = `<b>Раунд ${r}</b>`;
    el.append(p ? `${p.name}${p.handle ? " " + p.handle : ""}` : "—");
    const pr = prizeOf(r);
    if (pr) {
      const i = document.createElement("i");
      i.textContent = pr.name;
      el.append(i);
    }
    rail.append(el);
  }
}

const nextRound = () => Math.min(state.winners.length + 1, ROUNDS);

function prizeOf(round) {
  const p = state.prizes.prizes.find((x) => x.id === state.prizes.rounds[round]);
  return p ? { name: p.name, items: p.items } : null;
}

/** The prize selector next to «Крутити» and the visual's prize plate follow the next round. */
function renderPrize() {
  const r = nextRound();
  $("prizeRound").textContent = r;
  const sel = $("prizeSel");
  sel.innerHTML = "";
  sel.add(new Option("— без призу —", ""));
  for (const p of state.prizes.prizes) sel.add(new Option(p.name, p.id));
  sel.value = state.prizes.rounds[r] ?? "";
  sel.disabled = state.rolling || Boolean(MOCK) || state.winners.length >= ROUNDS;
  state.visual?.setPrize?.(state.winners.length >= ROUNDS ? null : prizeOf(r));
}

function renderStats() {
  const pool = state.participants.filter((p) => !p.won);
  const tickets = pool.reduce((s, p) => s + p.tickets, 0);
  const extra = POOL === "pumpkins" ? ` · повний набір: ${state.participants.filter((p) => p.pumpkins >= 15).length}` : "";
  $("stats").textContent = `Учасники: ${state.participants.length} · квитки: ${tickets}${extra}`;
  $("seed").textContent = state.seedHash ? `🔒 sha256: ${state.seedHash}` : "список не зафіксовано";
  $("seed").classList.toggle("locked", Boolean(state.seedHash));
  $("lock").disabled = state.rolling || state.locked || Boolean(MOCK);
  $("roll").disabled = state.rolling || state.winners.length >= ROUNDS || !pool.length;
  $("reroll").disabled = state.rolling || !state.winners.length;
  $("contact").hidden = state.rolling || !state.winners.length || Boolean(MOCK);
  renderPrize();
}

function ctx() {
  return {
    sound,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    privacy: { avatars: prefs.avatars },
    size: { w: innerWidth, h: innerHeight },
  };
}

function visibleList() {
  return state.participants.map((p) => (prefs.avatars ? p : { ...p, avatar: null }));
}

async function mountVisual(id) {
  state.visual?.destroy?.();
  stage.innerHTML = "";
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0";
  stage.append(root);
  const mod = await import(VISUALS[id] ?? `./visuals/${id}/index.js`);
  document.title = `${mod.meta?.title ?? id} · Halloween Draw`;
  state.visual = mod.mount(root, ctx());
  state.visual.setParticipants(visibleList());
  renderPrize();
}

async function roll(reroll = false) {
  if (state.rolling) return;
  const round = reroll ? Math.max(...state.winners.map((w) => w.round)) : nextRound();
  if (!MOCK && !TEST && state.prizes.prizes.length && !prizeOf(round) && !confirm(`Приз раунду ${round} не вибрано. Крутити без призу?`)) return;
  state.rolling = true;
  renderStats();
  $("msg").textContent = "";
  try {
    const res = await draw(reroll);
    const winnerId = res.winner.id ?? res.winner;
    if (!MOCK) {
      // The first draw locks the list on the server; a reroll voids the previous winner, who stays
      // out of the pool. Take the fresh state, but keep the new winner hidden until the reveal.
      await load();
      state.winners = state.winners.filter((w) => w.round !== res.round);
      const p = state.participants.find((x) => x.id === winnerId);
      if (p) p.won = false;
    } else if (reroll) {
      state.winners = state.winners.filter((w) => w.round !== res.round);
      markWon();
    }
    const winner = state.participants.find((p) => p.id === winnerId) ?? res.winner;
    state.visual.reset?.();
    state.visual.setParticipants(visibleList());
    renderRail();
    const shown = prefs.avatars ? winner : { ...winner, avatar: null };
    await state.visual.roll(shown, { round: res.round, totalRounds: ROUNDS, totalTickets: res.totalTickets, seedHash: state.seedHash, prize: prizeOf(res.round) });
    state.winners.push({ round: res.round, participantId: winner.id });
    winner.won = true;
    markWon();
    renderRail();
  } catch (e) {
    $("msg").textContent = String(e.message || e);
  } finally {
    state.rolling = false;
    renderStats();
  }
}

function setupControls() {
  const sel = $("visual");
  for (const id of Object.keys(VISUALS)) sel.add(new Option(id, id));
  const want = qs.get("visual");
  if (want && !VISUALS[want] && /^[a-z0-9-]+$/.test(want)) sel.add(new Option(want, want));
  sel.value = want && /^[a-z0-9-]+$/.test(want) ? want : Object.keys(VISUALS)[0];
  sel.onchange = () => {
    qs.set("visual", sel.value);
    history.replaceState(null, "", "?" + qs);
    mountVisual(sel.value).catch((e) => ($("msg").textContent = String(e)));
  };
  $("pool").value = POOL;
  $("pool").onchange = (e) => {
    qs.set("pool", e.target.value);
    location.search = "?" + qs;
  };
  $("test").checked = TEST;
  $("test").disabled = Boolean(MOCK);
  $("test").onchange = (e) => {
    if (e.target.checked) qs.set("test", "1");
    else qs.delete("test");
    location.search = "?" + qs;
  };
  document.body.classList.toggle("test", TEST);
  $("newTest").hidden = !TEST;
  $("newTest").onclick = async () => {
    try {
      await api("/test/reset", { method: "POST", body: "{}" });
      location.reload();
    } catch (e) { fail(e); }
  };
  $("roll").onclick = () => roll(false);
  $("reroll").onclick = () =>
    TEST || confirm("Перекрутити останній раунд? Попередній переможець цього раунду вибуває і в розіграші більше не бере участі.") && roll(true);
  $("lock").onclick = lockList;
  $("contacts").onclick = () => showContacts().catch(fail);
  $("codes").onclick = () => showCodes().catch(fail);
  $("proof").onclick = () => downloadProof().catch(fail);
  $("avatars").onchange = (e) => { prefs.avatars = e.target.checked; mountVisual(sel.value); };
  $("sound").onchange = (e) => { prefs.sound = e.target.checked; };
  $("hide").onclick = () => $("panel").classList.add("hidden");
  $("fs").onclick = toggleFullscreen;
  document.body.classList.toggle("no-hints", qs.get("hints") === "0");
  $("prizeSel").onchange = (e) => assignPrize(nextRound(), e.target.value);
  $("prizes").onclick = () => showPrizes().catch(fail);
  $("contact").onclick = () => showContact(Math.max(...state.winners.map((w) => w.round))).catch(fail);
  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || $("dlg").open) return;
    if (e.code === "KeyR") roll(false);
    if (e.code === "KeyH") $("panel").classList.toggle("hidden");
    if (e.code === "KeyF") toggleFullscreen();
    if (e.code === "KeyM") { prefs.sound = !prefs.sound; $("sound").checked = prefs.sound; }
  });
  return sel.value;
}

// ---------- admin dialogs ----------
const fail = (e) => ($("msg").textContent = String(e.message || e));
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function dialog(title, html) {
  $("dlg-title").textContent = title;
  $("dlg-body").innerHTML = html;
  if (!$("dlg").open) $("dlg").showModal();
  return $("dlg-body");
}

async function lockList() {
  if (!TEST && !confirm("Зафіксувати список учасників? Після цього нові гарбузи й замовлення вже не додадуть квитків.")) return;
  try {
    await api(P + "/lock", { method: "POST", body: "{}" });
    await load();
    state.visual?.setParticipants(visibleList());
    renderStats();
  } catch (e) { fail(e); }
}

// Full names and Telegram ids, for Maxim to message the winners. Never shown on the stream screen.
async function showContacts() {
  if (MOCK || TEST) return fail("У тестовому режимі контактів немає: учасники несправжні");
  const rows = await api("/winners");
  const body = rows.length
    ? `<table><tr><th>Раунд</th><th>Імʼя</th><th>Telegram</th><th>id</th><th>Коли</th><th></th></tr>${rows
        .map(
          (r) =>
            `<tr class="${r.voided ? "voided" : ""}"><td>${r.round}${r.attempt > 1 ? ` (спроба ${r.attempt})` : ""}</td><td>${esc(r.name)}</td><td>${
              r.username ? `<a href="https://t.me/${esc(r.username)}" target="_blank" rel="noopener">@${esc(r.username)}</a>` : "—"
            }</td><td>${esc(r.tgId)}</td><td>${new Date(r.drawnAt).toLocaleString("uk-UA")}</td><td>${
              r.voided ? "" : r.contacted ? `<a href="/support?thread=${esc(r.contacted.threadId)}" target="_blank" rel="noopener" class="ok">✓ написано</a>` : `<button data-msg="${r.round}">Написати</button>`
            }</td></tr>`
        )
        .join("")}</table><p class="muted">Закреслені — перекручені раунди. Без username — пишіть через бота або чат в адмінці за id.</p>`
    : "<p>Ще ніхто не виграв.</p>";
  const el = dialog("Контакти переможців (не показувати на стрімі)", body);
  el.querySelectorAll("[data-msg]").forEach((b) => (b.onclick = () => showContact(Number(b.dataset.msg)).catch(fail)));
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(fail);
}

async function assignPrize(round, prizeId) {
  try {
    state.prizes = await api("/prizes/assign", { method: "POST", body: JSON.stringify({ round, prizeId: prizeId ? Number(prizeId) : null }) });
  } catch (e) { fail(e); }
  renderPrize();
  renderRail();
}

// Prize packs, which pack each round plays for, and the winner message template.
async function showPrizes() {
  if (MOCK) return fail("У mock-режимі призів немає");
  state.prizes = await api("/prizes");
  const { prizes, rounds, template } = state.prizes;
  const opts = (r) =>
    `<option value="">— без призу —</option>${prizes.map((p) => `<option value="${p.id}"${rounds[r] === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}`;
  const list =
    prizes
      .map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${p.items.map(esc).join("<br>") || "—"}</td><td><button data-edit="${p.id}">Змінити</button> <button data-del="${p.id}" aria-label="Видалити">✕</button></td></tr>`)
      .join("") || "<tr><td colspan=3>Поки немає. Додайте паки нижче.</td></tr>";
  const el = dialog(
    "Призи розіграшу",
    `<table><tr><th>Пак</th><th>Що всередині</th><th></th></tr>${list}</table>
    <form class="pack" style="margin-top:12px;display:grid;gap:8px">
      <input type="hidden" name="id" />
      <input name="name" placeholder="Назва паку, напр. «Мишка Lamzu + килимок»" required maxlength="120" />
      <textarea name="items" rows="3" placeholder="Що входить, по рядку на пункт"></textarea>
      <div><button class="primary">Зберегти пак</button> <button type="button" data-new hidden>Скасувати</button></div>
    </form>
    <h3 style="margin:18px 0 8px">Який пак у якому раунді</h3>
    <div class="grid2">${Array.from({ length: ROUNDS }, (_, i) => `<label>Раунд ${i + 1} <select data-round="${i + 1}">${opts(i + 1)}</select></label>`).join("")}</div>
    <h3 style="margin:18px 0 8px">Повідомлення переможцю</h3>
    <textarea name="tpl" rows="9">${esc(template)}</textarea>
    <p class="muted">Підстановки: {name} — імʼя, {round} — раунд, {prize} — назва паку, {items} — список із паку. Перед відправкою текст можна поправити.</p>
    <button data-tpl>Зберегти шаблон</button>`
  );
  const post = async (path, payload) => {
    try {
      state.prizes = await api(path, { method: "POST", body: JSON.stringify(payload) });
      renderPrize();
      renderRail();
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };
  const form = el.querySelector("form.pack");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (await post("/prizes", { id: f.get("id") ? Number(f.get("id")) : undefined, name: f.get("name"), items: f.get("items") })) showPrizes();
  };
  el.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
    const p = prizes.find((x) => x.id === Number(b.dataset.edit));
    form.elements.id.value = p.id;
    form.elements.name.value = p.name;
    form.elements.items.value = p.items.join("\n");
    form.querySelector("[data-new]").hidden = false;
    form.elements.name.focus();
  }));
  form.querySelector("[data-new]").onclick = () => showPrizes();
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (confirm("Видалити пак? Раунди з ним залишаться без призу.") && (await post("/prizes/delete", { id: Number(b.dataset.del) }))) showPrizes();
  }));
  el.querySelectorAll("[data-round]").forEach((s) => (s.onchange = () => post("/prizes/assign", { round: Number(s.dataset.round), prizeId: s.value ? Number(s.value) : null })));
  el.querySelector("[data-tpl]").onclick = async () => {
    if (await post("/prizes/template", { text: el.querySelector("[name=tpl]").value })) el.querySelector("[data-tpl]").textContent = "Збережено ✓";
  };
}

// «Написати переможцю»: the filled template, editable, goes to the winner as a shop chat message
// (bot DM with a button into the chat; the answer comes to «Чати» in the admin panel).
async function showContact(round) {
  if (MOCK) return fail("У mock-режимі писати нікому");
  const pv = await api("/contact/preview", { method: "POST", body: JSON.stringify({ round, test: TEST }) });
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
      const r = await api("/contact/send", { method: "POST", body: JSON.stringify({ round, test: TEST, text: el.querySelector("[name=text]").value }) });
      el.querySelector("[data-res]").innerHTML = `<span class="ok">Надіслано ✓</span>${r.threadId ? ` · <a href="/support?thread=${esc(r.threadId)}" target="_blank" rel="noopener">відкрити чат</a>` : ""}`;
    } catch (e) {
      btn.disabled = false;
      el.querySelector("[data-res]").innerHTML = `<span class="warn">${esc(e.message || e)}</span>`;
    }
  };
}

async function showCodes() {
  if (MOCK) return fail("У mock-режимі кодів немає");
  const list = await api("/codes");
  const rows =
    list
      .map(
        (c) =>
          `<tr><td><b>${esc(c.code)}</b></td><td>+${c.bonus}</td><td>${c.used} / ${c.maxUses}</td><td>${
            c.active ? `<button data-off="${esc(c.code)}">Вимкнути</button>` : "вимкнено"
          }</td></tr>`
      )
      .join("") || "<tr><td colspan=4>Поки немає</td></tr>";
  const el = dialog(
    "Кодові слова",
    `<table><tr><th>Код</th><th>Гарбузів</th><th>Використано</th><th></th></tr>${rows}</table>
    <form class="add"><input name="code" placeholder="СЛОВО" required minlength="3" maxlength="40" />
      <label>гарбузів <input name="bonus" type="number" min="1" max="50" value="5" style="width:70px" /></label>
      <label>вводів <input name="maxUses" type="number" min="1" value="50" style="width:90px" /></label>
      <button>Додати</button></form>
    <p class="muted">Одна людина вводить слово один раз. Повторне «Додати» з тим самим словом змінює гарбузи й ліміт.</p>`
  );
  const byCode = new Map(list.map((c) => [c.code, c]));
  const save = async (payload) => {
    try {
      await api("/codes", { method: "POST", body: JSON.stringify(payload) });
      await showCodes();
    } catch (err) { fail(err); }
  };
  el.querySelector("form.add").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    save({ code: f.get("code"), bonus: f.get("bonus"), maxUses: f.get("maxUses") });
  };
  el.querySelectorAll("[data-off]").forEach((b) => {
    const c = byCode.get(b.dataset.off);
    b.onclick = () => save({ code: c.code, bonus: c.bonus, maxUses: c.maxUses, active: false });
  });
}

async function downloadProof() {
  if (MOCK || TEST) return fail("У тестовому режимі доказу немає");
  const data = await api("/proof");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = "halloween-draw-proof.json";
  a.click();
}

(async () => {
  const id = setupControls();
  try {
    await load();
    markWon();
    renderRail();
    renderStats();
    await mountVisual(id);
  } catch (e) {
    $("msg").textContent = String(e.message || e);
  }
  // Live: new participants keep coming until the stream starts.
  if (!MOCK && !TEST) setInterval(async () => {
    if (state.rolling) return;
    try {
      const before = state.participants.length;
      await load();
      markWon();
      renderStats();
      renderRail();
      if (state.participants.length !== before) state.visual?.setParticipants(visibleList());
    } catch { /* keep the screen */ }
  }, 30000);
})();
