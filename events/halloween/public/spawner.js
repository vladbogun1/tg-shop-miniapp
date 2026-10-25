/* Halloween 2026 pumpkin hunt widget — loaded by the website and the Mini App from /hw/spawner.js.
 *
 * The host page sets window.HW_CONFIG before loading this file:
 *   app:        "site" | "miniapp"
 *   locale:     "uk" | "ru" | "en"            (or getLocale(): string)
 *   getToken(): string | null                  Mini App bearer; the site relies on its cookie
 *   refresh():  Promise<boolean>               site: refresh an expired access cookie
 *   login():    void                           open the sign-in flow
 *   haptic(kind): void                         Telegram haptics ("light" | "success" | "error")
 *   insets():   { top, bottom }                px the header / tab bar cover
 *   openLink(url): void                        Mini App: open links outside the webview
 *   rulesUrl:   string                         the rules page
 * and places <hw-counter></hw-counter> where the counter belongs (header). Everything else lives
 * in a shadow root appended to <body>, so no CSS leaks either way.
 */
(() => {
  if (window.__hwLoaded) return;
  window.__hwLoaded = true;

  const cfg = window.HW_CONFIG || {};
  const BASE = "/hw";
  const API = BASE + "/api";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------- texts ----------------
  const T = {
    uk: {
      title: "Хеллоуїн-полювання", hunt: "Збирай гарбузи", of: "з",
      today: "Сьогодні", todayCap: "На сьогодні все — нові гарбузи завтра",
      goal: (g) => `Збери ${g} гарбузів — і ти в розіграші на стрімі`,
      inDraw: "Ти в розіграші!", tickets: (n) => `${n} ${plural(n, "квиток", "квитки", "квитків")}`,
      howTitle: "Як потрапити в розіграш", how1: (g) => `${g} гарбузів = 1 квиток`, how2: "Кожне замовлення цього тижня = +1 квиток",
      how3: "Квитки сумуються: більше квитків — більше шансів", how4: (c) => `Не більше ${c} гарбузів на день`,
      code: "Кодове слово зі стріму", codePh: "Введи слово", codeBtn: "Активувати",
      codeOk: (b) => `+${b} гарбузів!`, codeErr: { unknown: "Такого слова немає", already: "Ти вже вводив це слово", exhausted: "Слово вже використали всі, хто встиг", "not-live": "Акція не триває" },
      stream: "Розіграш на стрімі", watch: "Дивитися стрім", rules: "Правила",
      login: "Увійди через Telegram, щоб збирати гарбузи", loginBtn: "Увійти через Telegram",
      gotIt: "Гарбуз твій!", got: (n, g) => `${n} з ${g}`,
      win: "Ти в розіграші!", winText: "Гарбузи зібрано. Чекаємо тебе на стрімі — переможця оберуть наживо.",
      soon: "Полювання почнеться в понеділок", over: "Полювання завершено", close: "Закрити",
      weekdays: ["нд", "пн", "вт", "ср", "чт", "пт", "сб"],
    },
    ru: {
      title: "Хэллоуин-охота", hunt: "Собирай тыквы", of: "из",
      today: "Сегодня", todayCap: "На сегодня всё — новые тыквы завтра",
      goal: (g) => `Собери ${g} тыкв — и ты в розыгрыше на стриме`,
      inDraw: "Ты в розыгрыше!", tickets: (n) => `${n} ${plural(n, "билет", "билета", "билетов")}`,
      howTitle: "Как попасть в розыгрыш", how1: (g) => `${g} тыкв = 1 билет`, how2: "Каждый заказ на этой неделе = +1 билет",
      how3: "Билеты суммируются: больше билетов — больше шансов", how4: (c) => `Не больше ${c} тыкв в день`,
      code: "Кодовое слово со стрима", codePh: "Введи слово", codeBtn: "Активировать",
      codeOk: (b) => `+${b} тыкв!`, codeErr: { unknown: "Такого слова нет", already: "Ты уже вводил это слово", exhausted: "Слово уже использовали все, кто успел", "not-live": "Акция не идёт" },
      stream: "Розыгрыш на стриме", watch: "Смотреть стрим", rules: "Правила",
      login: "Войди через Telegram, чтобы собирать тыквы", loginBtn: "Войти через Telegram",
      gotIt: "Тыква твоя!", got: (n, g) => `${n} из ${g}`,
      win: "Ты в розыгрыше!", winText: "Тыквы собраны. Ждём тебя на стриме — победителя выберут вживую.",
      soon: "Охота начнётся в понедельник", over: "Охота завершена", close: "Закрыть",
      weekdays: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
    },
    en: {
      title: "Halloween hunt", hunt: "Collect pumpkins", of: "of",
      today: "Today", todayCap: "That's all for today — new pumpkins tomorrow",
      goal: (g) => `Collect ${g} pumpkins to enter the stream giveaway`,
      inDraw: "You're in the draw!", tickets: (n) => `${n} ${n === 1 ? "ticket" : "tickets"}`,
      howTitle: "How to enter", how1: (g) => `${g} pumpkins = 1 ticket`, how2: "Every order this week = +1 ticket",
      how3: "Tickets add up: more tickets, better odds", how4: (c) => `Up to ${c} pumpkins a day`,
      code: "Stream code word", codePh: "Enter the word", codeBtn: "Redeem",
      codeOk: (b) => `+${b} pumpkins!`, codeErr: { unknown: "No such word", already: "You already used this word", exhausted: "This word has run out", "not-live": "The event is not running" },
      stream: "Giveaway on stream", watch: "Watch the stream", rules: "Rules",
      login: "Sign in with Telegram to collect pumpkins", loginBtn: "Sign in with Telegram",
      gotIt: "Got it!", got: (n, g) => `${n} of ${g}`,
      win: "You're in the draw!", winText: "Pumpkins collected. See you on stream — the winner is picked live.",
      soon: "The hunt starts on Monday", over: "The hunt is over", close: "Close",
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    },
  };
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const lang = () => {
    const l = (cfg.getLocale ? cfg.getLocale() : cfg.locale) || document.documentElement.lang || "uk";
    return T[l.slice(0, 2)] ? l.slice(0, 2) : "uk";
  };
  const t = () => T[lang()];

  // ---------------- state ----------------
  const st = { phase: null, goal: 50, dailyCap: 15, streamAt: null, streamUrl: "", me: null, signedIn: false, capped: false };
  const counters = new Set();

  // ---------------- api ----------------
  async function call(path, body, retried) {
    const headers = { "Content-Type": "application/json" };
    const token = cfg.getToken && cfg.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers,
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried && cfg.refresh) {
      if (await cfg.refresh().catch(() => false)) return call(path, body, true);
    }
    if (!res.ok) throw Object.assign(new Error("hw " + res.status), { status: res.status });
    return res.json();
  }

  async function loadState() {
    const s = await call("/state");
    st.phase = s.phase;
    st.goal = s.goal;
    st.dailyCap = s.dailyCap;
    st.streamAt = s.streamAt;
    st.streamUrl = s.streamUrl;
    st.me = s.me;
    st.signedIn = Boolean(s.me);
    st.capped = Boolean(s.me && s.me.today >= s.dailyCap);
    renderCounters();
  }

  // ---------------- art ----------------
  const PUMPKIN_SVG = (face) => `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M33 10c1-4 5-6 8-5-3 2-4 4-4 7" fill="#3f7a1e" stroke="#0e0e10" stroke-width="2"/>
  <ellipse cx="20" cy="36" rx="14" ry="19" fill="#e85d04" stroke="#0e0e10" stroke-width="2.5"/>
  <ellipse cx="44" cy="36" rx="14" ry="19" fill="#e85d04" stroke="#0e0e10" stroke-width="2.5"/>
  <ellipse cx="32" cy="36" rx="13" ry="21" fill="#ff7a1a" stroke="#0e0e10" stroke-width="2.5"/>
  ${face === 2
    ? '<circle cx="24" cy="31" r="4.5" fill="#ffd24a"/><circle cx="40" cy="31" r="4.5" fill="#ffd24a"/><ellipse cx="32" cy="45" rx="5" ry="6" fill="#ffd24a"/>'
    : face === 3
    ? '<path d="M19 31l8-4v6z" fill="#ffd24a"/><path d="M38 30h8" stroke="#ffd24a" stroke-width="3" stroke-linecap="round"/><path d="M20 42q12 10 24 0q-12 4-24 0z" fill="#ffd24a"/>'
    : face === 4
    ? '<path d="M18 26q14-14 28 0" fill="none" stroke="#1a1a1a" stroke-width="4"/><rect x="13" y="26" width="7" height="10" rx="3" fill="#1a1a1a"/><rect x="44" y="26" width="7" height="10" rx="3" fill="#1a1a1a"/><path d="M22 33l6-3v6zM42 33l-6-3v6z" fill="#7cff4f"/><path d="M22 43h20l-4 5h-12z" fill="#7cff4f"/>'
    : '<path d="M19 33l8-6 1 8zM45 33l-8-6-1 8z" fill="#ffd24a"/><path d="M18 42l4 3 4-3 3 3 3-3 3 3 3-3 4 3 4-3q-4 9-14 9t-14-9z" fill="#ffd24a"/>'}
</svg>`;

  function pumpkinArt(kind) {
    const img = new Image();
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    img.src = `${BASE}/sprites/pumpkin-${kind}.webp`;
    const box = document.createElement("span");
    box.className = "art";
    img.onerror = () => { box.innerHTML = PUMPKIN_SVG(kind); };
    box.append(img);
    return box;
  }

  // ---------------- shadow root ----------------
  const host = document.createElement("div");
  host.id = "hw-root";
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Exo 2 Variable", "Exo 2", system-ui, sans-serif; }
    .pk { position: fixed; width: var(--s); height: var(--s); pointer-events: auto; cursor: pointer; touch-action: manipulation;
      -webkit-tap-highlight-color: transparent; border: 0; padding: 0; background: none; transform-origin: 50% 90%;
      animation: pk-in .45s cubic-bezier(.2,1.6,.4,1) both; }
    .pk::before { content: ""; position: absolute; inset: -14px; } /* bigger hit area than the art */
    .pk .art { position: absolute; inset: 0; display: block; filter: drop-shadow(0 0 10px #ff6a0099) drop-shadow(0 3px 2px #0008);
      animation: pk-bob 1.6s ease-in-out infinite; }
    .pk .art img, .pk .art svg { width: 100%; height: 100%; display: block; }
    .pk.peek-l { animation-name: pk-peek-l; } .pk.peek-r { animation-name: pk-peek-r; } .pk.peek-b { animation-name: pk-peek-b; }
    .pk.leaving { animation: pk-out .5s ease-in forwards; pointer-events: none; }
    .pk.got { animation: none; pointer-events: none; }
    @keyframes pk-in { from { transform: scale(0) rotate(-25deg); opacity: 0 } to { transform: none; opacity: 1 } }
    @keyframes pk-peek-l { from { transform: translateX(-120%) rotate(-30deg) } to { transform: none } }
    @keyframes pk-peek-r { from { transform: translateX(120%) rotate(30deg) } to { transform: none } }
    @keyframes pk-peek-b { from { transform: translateY(120%) } to { transform: none } }
    @keyframes pk-out { to { transform: translateY(30px) scale(.4); opacity: 0 } }
    @keyframes pk-bob { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-6px) rotate(4deg) } }
    .burst { position: fixed; width: 10px; height: 10px; border-radius: 50%; pointer-events: none; }
    .fly { position: fixed; pointer-events: none; z-index: 2; transition: transform .7s cubic-bezier(.5,-0.3,.6,1), opacity .7s; }
    .toast { position: fixed; left: 50%; transform: translate(-50%, 20px); opacity: 0; transition: .25s; pointer-events: none;
      background: #16161a; color: #fff; border: 1px solid #ff660066; box-shadow: 0 8px 30px #000a, 0 0 22px #ff660033;
      border-radius: 14px; padding: 10px 16px; font-size: 15px; font-weight: 700; white-space: nowrap; }
    .toast.on { transform: translate(-50%, 0); opacity: 1; }
    .toast b { color: #ff7a1a; }
    .veil { position: fixed; inset: 0; background: #000b; backdrop-filter: blur(3px); pointer-events: auto; display: flex;
      align-items: flex-end; justify-content: center; animation: fade .2s both; }
    @media (min-width: 720px) { .veil { align-items: center; } }
    @keyframes fade { from { opacity: 0 } }
    .sheet { width: min(460px, 100%); max-height: 92vh; overflow: auto; background: #121214; color: #f4f1ea;
      border: 1px solid #ffffff1a; border-radius: 20px 20px 0 0; padding: 20px 18px calc(18px + env(safe-area-inset-bottom));
      box-shadow: 0 -10px 60px #ff66001f; position: relative; animation: up .3s cubic-bezier(.2,1,.3,1) both; }
    @media (min-width: 720px) { .sheet { border-radius: 20px; } }
    @keyframes up { from { transform: translateY(40px); opacity: 0 } }
    .sheet h2 { margin: 0 0 4px; font-size: 22px; letter-spacing: .01em; }
    .sheet h3 { margin: 18px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #9a958c; }
    .sheet p { margin: 6px 0; color: #cfcac0; font-size: 14px; line-height: 1.45; }
    .x { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 50%; border: 0; background: #ffffff12; color: #fff; font-size: 20px; cursor: pointer; }
    .hero { display: flex; gap: 14px; align-items: center; }
    .hero .big { width: 72px; height: 72px; flex: none; position: relative; }
    .hero .big .art { position: absolute; inset: 0; }
    .hero .big img, .hero .big svg { width: 100%; height: 100%; }
    .num { font-size: 30px; font-weight: 800; color: #ff7a1a; }
    .num small { font-size: 16px; color: #9a958c; font-weight: 600; }
    .bar { height: 12px; border-radius: 99px; background: #ffffff12; overflow: hidden; margin: 12px 0 6px; border: 1px solid #ffffff14; }
    .bar i { display: block; height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, #ff6600, #ffb347); box-shadow: 0 0 12px #ff6600; transition: width .6s; }
    .row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: #9a958c; }
    .ok { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #7cff4f14; border: 1px solid #7cff4f55; color: #b8ff9c; font-weight: 700; }
    ul { margin: 0; padding-left: 18px; color: #cfcac0; font-size: 14px; line-height: 1.6; }
    form { display: flex; gap: 8px; }
    input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid #ffffff26; background: #0c0c0e; color: #fff; padding: 0 12px; font-size: 16px; text-transform: uppercase; }
    input:focus { outline: 2px solid #ff660088; border-color: transparent; }
    .btn { height: 44px; border: 0; border-radius: 12px; padding: 0 16px; font-weight: 800; font-size: 15px; cursor: pointer; background: #ff6600; color: #160900; white-space: nowrap; }
    .btn.wide { width: 100%; margin-top: 14px; }
    .btn.ghost { background: #ffffff10; color: #fff; }
    .msg { min-height: 20px; font-size: 13px; margin-top: 6px; }
    .msg.good { color: #b8ff9c; } .msg.bad { color: #ff8a7a; }
    a { color: #ff9a4d; }
    .center { text-align: center; }
    .center .big { margin: 0 auto 8px; width: 110px; height: 110px; position: relative; }
    .center .big .art { position: absolute; inset: 0; animation: pk-bob 1.6s ease-in-out infinite; }
    .big .art { display: block; }
    .big .art img, .big .art svg { width: 100%; height: 100%; display: block; object-fit: contain; image-rendering: pixelated; }
    .center .big.winner { width: 180px; height: 180px; margin-top: -24px; }
    .center .big.winner img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; animation: pk-bob 1.6s ease-in-out infinite; }
  </style>`;
  const layer = document.createElement("div");
  root.append(layer);

  function mountRoot() {
    if (!host.isConnected) document.body.append(host);
  }

  function insets() {
    const i = (cfg.insets && cfg.insets()) || {};
    return { top: Math.max(i.top || 0, 64), bottom: Math.max(i.bottom || 0, 16) };
  }

  // ---------------- counter <hw-counter> ----------------
  class HwCounter extends HTMLElement {
    connectedCallback() {
      if (!this.shadowRoot) {
        const r = this.attachShadow({ mode: "open" });
        r.innerHTML = `<style>
          :host { display: inline-flex; }
          :host([hidden]) { display: none; }
          button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 10px 0 4px;
            border-radius: 99px; background: #ff66001a; border: 1px solid #ff660055; color: #fff; font: 800 13px/1 "Exo 2 Variable", "Exo 2", system-ui, sans-serif;
            white-space: nowrap; -webkit-tap-highlight-color: transparent; transition: transform .15s; }
          button:active { transform: scale(.94); }
          .ic { width: 26px; height: 26px; position: relative; flex: none; }
          .ic .art, .ic img, .ic svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
          .of { color: #ffb37a; font-weight: 700; }
          .ok { width: 16px; height: 16px; border-radius: 50%; background: #7cff4f; color: #0e0e10; display: grid; place-items: center; font-size: 11px; }
          .pop { animation: pop .5s cubic-bezier(.2,1.8,.4,1); }
          @keyframes pop { 40% { transform: scale(1.25) } }
          /* phone headers have no spare room: drop "/50", and on the narrowest only the pumpkin stays (the panel shows the count) */
          @media (max-width: 399px) { .of { display: none; } button { gap: 3px; padding: 0 8px 0 3px; } }
          @media (max-width: 359px) { .n { display: none; } button { padding: 0; background: none; border: 0; } }
        </style><button type="button" part="button" aria-label="Halloween"><span class="ic"></span><span class="n"></span></button>`;
        r.querySelector(".ic").append(pumpkinArt(1));
        r.querySelector("button").addEventListener("click", () => openPanel());
      }
      counters.add(this);
      renderCounters();
    }
    disconnectedCallback() { counters.delete(this); }
    get target() { return this.shadowRoot.querySelector(".ic"); }
  }
  if (!customElements.get("hw-counter")) customElements.define("hw-counter", HwCounter);

  function renderCounters() {
    for (const c of counters) {
      if (!c.shadowRoot) continue;
      const show = st.phase === "live" || (st.phase === "over" && st.me && st.me.inDraw);
      c.hidden = !show;
      const n = c.shadowRoot.querySelector(".n");
      if (!st.me) n.innerHTML = `<span class="of">🎃</span>`;
      else if (st.me.inDraw) n.innerHTML = `${Math.min(st.me.pumpkins, 999)}<span class="ok" title="${t().inDraw}">✓</span>`;
      else n.innerHTML = `${st.me.pumpkins}<span class="of">/${st.goal}</span>`;
    }
  }
  function visibleCounter() {
    for (const c of counters) {
      const r = c.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < innerHeight) return c;
    }
    return null;
  }

  // ---------------- toast ----------------
  let toastTimer;
  function toast(html, ms = 2200) {
    mountRoot();
    let el = layer.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      layer.append(el);
    }
    el.style.bottom = insets().bottom + 18 + "px";
    el.innerHTML = html;
    requestAnimationFrame(() => el.classList.add("on"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), ms);
  }

  // ---------------- spawning ----------------
  let current = null;
  let timer = null;

  function spot(size) {
    const { top, bottom } = insets();
    const W = innerWidth, H = innerHeight;
    const minY = top + 12, maxY = H - bottom - size - 12;
    if (maxY <= minY) return null;
    // Prefer peeking from behind a picture on screen (product photos, banners), else from an edge.
    const imgs = [...document.querySelectorAll("img, [data-hw-spot]")].filter((el) => {
      if (host.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 90 && r.height >= 70 && r.top >= minY && r.bottom <= maxY + size && r.left >= 0 && r.right <= W;
    });
    if (imgs.length && Math.random() < 0.7) {
      const r = imgs[Math.floor(Math.random() * imgs.length)].getBoundingClientRect();
      const right = Math.random() < 0.5;
      const x = right ? r.right - size * 0.55 : r.left - size * 0.45;
      const y = r.top + Math.random() * Math.max(1, r.height - size);
      return { x: clamp(x, 4, W - size - 4), y: clamp(y, minY, maxY), cls: "" };
    }
    const side = Math.random();
    if (side < 0.4) return { x: -size * 0.15, y: minY + Math.random() * (maxY - minY), cls: "peek-l" };
    if (side < 0.8) return { x: W - size * 0.85, y: minY + Math.random() * (maxY - minY), cls: "peek-r" };
    return { x: 16 + Math.random() * (W - size - 32), y: maxY, cls: "peek-b" };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function show(sp) {
    // sp: { id?, kind, ttlMs } — no id = a guest's pumpkin (tap asks to sign in)
    mountRoot();
    const size = innerWidth < 600 ? 60 : 72;
    const at = spot(size);
    if (!at) return false;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "pk " + at.cls;
    el.setAttribute("aria-label", "🎃");
    el.style.cssText = `--s:${size}px;left:${at.x}px;top:${at.y}px`;
    el.append(pumpkinArt(sp.kind));
    layer.append(el);
    current = { ...sp, el, born: performance.now() };
    const leaveAt = sp.ttlMs - 600;
    current.leave = setTimeout(() => leave(el), leaveAt);
    // A pumpkin that scrolled away with the page is pointless — it is fixed, so only hide on big jumps.
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tap(el);
    }, { once: true });
    return true;
  }

  function leave(el) {
    if (!el.isConnected) return;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 520);
    if (current && current.el === el) current = null;
  }

  function burst(x, y) {
    if (reduced) return;
    const colors = ["#ff6600", "#ffb347", "#7cff4f", "#ffd24a", "#8a3ffc"];
    for (let i = 0; i < 16; i++) {
      const p = document.createElement("i");
      p.className = "burst";
      p.style.cssText = `left:${x - 5}px;top:${y - 5}px;background:${colors[i % colors.length]};box-shadow:0 0 8px ${colors[i % colors.length]}`;
      layer.append(p);
      const a = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const d = 40 + Math.random() * 50;
      p.animate(
        [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.2)`, opacity: 0 }],
        { duration: 600 + Math.random() * 300, easing: "cubic-bezier(.2,.8,.3,1)" },
      ).onfinish = () => p.remove();
    }
  }

  function flyToCounter(el) {
    const from = el.getBoundingClientRect();
    const c = visibleCounter();
    if (!c) { el.remove(); return; }
    const to = c.target.getBoundingClientRect();
    el.classList.add("fly");
    el.style.transform = "none";
    requestAnimationFrame(() => {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      el.style.transform = `translate(${dx}px,${dy}px) scale(${to.width / from.width})`;
      el.style.opacity = ".2";
    });
    setTimeout(() => {
      el.remove();
      const b = c.shadowRoot.querySelector("button");
      b.classList.remove("pop");
      void b.offsetWidth;
      b.classList.add("pop");
    }, 720);
  }

  async function tap(el) {
    if (!current || current.el !== el) return;
    const sp = current;
    clearTimeout(sp.leave);
    current = null;
    if (!sp.id) {
      leave(el);
      cfg.haptic && cfg.haptic("light");
      openLogin();
      schedule();
      return;
    }
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    el.classList.add("got");
    cfg.haptic && cfg.haptic("success");
    flyToCounter(el);
    try {
      const wasIn = st.me && st.me.inDraw;
      const res = await call("/collect", { id: sp.id });
      st.me = res.me;
      renderCounters();
      if (res.ok) {
        toast(`🎃 ${t().gotIt} <b>${t().got(Math.min(res.me.pumpkins, st.goal), st.goal)}</b>`);
        if (!wasIn && res.me.pumpkins >= st.goal) setTimeout(openWin, 900);
      } else if (res.reason === "daily-cap") {
        st.capped = true;
        toast(t().todayCap, 3000);
      }
    } catch { /* offline: the pumpkin is lost, nothing else breaks */ }
    schedule();
  }

  function delay(first) {
    if (!st.signedIn) return first ? rand(12, 25) : rand(90, 160);
    return first ? rand(6, 14) : rand(38, 75);
  }
  const rand = (a, b) => (a + Math.random() * (b - a)) * 1000;

  let firstDone = false;
  function schedule(ms) {
    clearTimeout(timer);
    if (st.phase !== "live" || st.capped) return;
    const wait = ms ?? delay(!firstDone);
    firstDone = true;
    timer = setTimeout(tick, wait);
  }

  async function tick() {
    if (document.visibilityState !== "visible" || current || document.querySelector("dialog[open]")) return schedule(rand(4, 8));
    if (layer.querySelector(".veil")) return schedule(rand(5, 10));
    if (!st.signedIn) {
      show({ kind: 1 + Math.floor(Math.random() * 4), ttlMs: 8000 }) || schedule(rand(5, 10));
      if (current) setTimeout(() => !current && schedule(), 8200);
      return;
    }
    try {
      const sp = await call("/spawn", { app: cfg.app || "" });
      if (sp.id) {
        if (!show(sp)) return schedule(rand(4, 8));
        setTimeout(() => { if (!current) schedule(); }, sp.ttlMs + 300);
        return;
      }
      if (sp.none === "daily-cap") { st.capped = true; return; }
      if (sp.none === "wait") return schedule(sp.waitMs + rand(3, 10));
    } catch (e) {
      if (e.status === 401) { st.signedIn = false; st.me = null; renderCounters(); }
    }
    schedule();
  }

  // ---------------- dialogs ----------------
  function modal(html) {
    mountRoot();
    closeModal();
    const veil = document.createElement("div");
    veil.className = "veil";
    veil.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="x" type="button" aria-label="${t().close}">×</button>${html}</div>`;
    veil.addEventListener("click", (e) => {
      if (e.target === veil || e.target.closest(".x")) return closeModal();
      const link = e.target.closest("a[href]");
      if (link && cfg.openLink) {
        e.preventDefault();
        cfg.openLink(link.href);
      }
    });
    layer.append(veil);
    return veil.querySelector(".sheet");
  }
  function closeModal() { layer.querySelector(".veil")?.remove(); }
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  function streamWhen() {
    if (!st.streamAt) return "";
    const d = new Date(st.streamAt);
    if (isNaN(d)) return st.streamAt;
    const loc = lang() === "uk" ? "uk-UA" : lang() === "ru" ? "ru-UA" : "en-GB";
    return `${t().weekdays[d.getDay()]}, ${d.toLocaleDateString(loc, { day: "numeric", month: "long", timeZone: "Europe/Kyiv" })}, ${d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}`;
  }

  function openLogin() {
    const s = modal(`<div class="center"><div class="big"></div><h2>${t().title}</h2><p>${t().login}</p>
      <button class="btn wide" type="button" data-login>${t().loginBtn}</button></div>`);
    s.querySelector(".big").append(pumpkinArt(3));
    s.querySelector("[data-login]").onclick = () => { closeModal(); cfg.login && cfg.login(); };
  }

  function openWin() {
    cfg.haptic && cfg.haptic("success");
    const s = modal(`<div class="center"><div class="big winner"><img src="${BASE}/sprites/winner.webp" alt="" width="180" height="180" /></div><h2>${t().win}</h2><p>${t().winText}</p>
      <p><b>${t().stream}:</b> ${streamWhen()}</p>
      <button class="btn wide" type="button" data-close>OK</button></div>`);
    s.querySelector("[data-close]").onclick = closeModal;
    for (let i = 0; i < 4; i++) setTimeout(() => burst(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.25 + Math.random() * 0.4)), i * 220);
  }

  function openPanel() {
    const tx = t();
    const me = st.me;
    const pct = me ? Math.min(100, (me.pumpkins / st.goal) * 100) : 0;
    const status =
      st.phase === "soon" ? `<p>${tx.soon}</p>` :
      st.phase === "over" ? `<p>${tx.over}</p>` : "";
    const progress = me
      ? `<div class="bar"><i style="width:${pct}%"></i></div>
         <div class="row"><span>${tx.today}: ${me.today}/${st.dailyCap}</span><span>${me.orders ? "🛒 " + me.orders : ""}</span></div>
         ${me.inDraw ? `<div class="ok">✓ ${tx.inDraw} · ${tx.tickets(me.tickets)}</div>` : `<p>${tx.goal(st.goal)}</p>`}
         ${st.capped ? `<p>${tx.todayCap}</p>` : ""}`
      : `<p>${tx.login}</p><button class="btn wide" type="button" data-login>${tx.loginBtn}</button>`;
    const code = me && st.phase === "live"
      ? `<h3>${tx.code}</h3><form><input name="code" autocomplete="off" autocapitalize="characters" maxlength="40" placeholder="${tx.codePh}" /><button class="btn" type="submit">${tx.codeBtn}</button></form><div class="msg"></div>`
      : "";
    const s = modal(`
      <div class="hero"><div class="big"></div><div><h2>${tx.title}</h2>
        <div class="num">${me ? me.pumpkins : 0}<small> / ${st.goal}</small></div></div></div>
      ${status}${progress}${code}
      <h3>${tx.howTitle}</h3>
      <ul><li>${tx.how1(st.goal)}</li><li>${tx.how2}</li><li>${tx.how3}</li><li>${tx.how4(st.dailyCap)}</li></ul>
      <h3>${tx.stream}</h3><p>${streamWhen()}${st.streamUrl ? ` · <a href="${st.streamUrl}" target="_blank" rel="noopener">${tx.watch}</a>` : ""}</p>
      <p><a href="${cfg.rulesUrl || "/halloween-rules"}" target="_blank" rel="noopener">${tx.rules}</a></p>`);
    s.querySelector(".big").append(pumpkinArt(me && me.inDraw ? 4 : 1));
    s.querySelector("[data-login]")?.addEventListener("click", () => { closeModal(); cfg.login && cfg.login(); });
    const form = s.querySelector("form");
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const msg = s.querySelector(".msg");
      const btn = form.querySelector("button");
      btn.disabled = true;
      try {
        const res = await call("/code", { code: form.code.value });
        st.me = res.me;
        renderCounters();
        if (res.ok) {
          msg.className = "msg good";
          msg.textContent = tx.codeOk(res.bonus);
          cfg.haptic && cfg.haptic("success");
          s.querySelector(".num").innerHTML = `${res.me.pumpkins}<small> / ${st.goal}</small>`;
          s.querySelector(".bar i").style.width = Math.min(100, (res.me.pumpkins / st.goal) * 100) + "%";
          form.code.value = "";
          if (res.me.inDraw && res.me.pumpkins - res.bonus < st.goal) setTimeout(openWin, 800);
        } else {
          msg.className = "msg bad";
          msg.textContent = tx.codeErr[res.reason] || tx.codeErr.unknown;
          cfg.haptic && cfg.haptic("error");
        }
      } catch (err) {
        msg.className = "msg bad";
        msg.textContent = err.status === 429 ? "…" : tx.codeErr.unknown;
      } finally {
        btn.disabled = false;
      }
    };
  }

  // ---------------- start ----------------
  async function start() {
    try {
      await loadState();
    } catch {
      return; // service is off: no widget at all
    }
    document.documentElement.dataset.hw = st.phase;
    schedule();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !current) schedule(rand(3, 8));
  });

  window.HW = {
    open: openPanel,
    /** The host calls this after sign-in / sign-out so the widget picks the new identity up. */
    refresh: () => loadState().then(() => schedule(rand(4, 8))).catch(() => {}),
    _debugSpawn: () => tick(),
    _debugWin: () => openWin(),
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
