// «Гарбузовий Рояль»: участники це гарбузові бійці й маркери на піксельній карті острова, зона шторму
// стискається навколо заздалегідь заданого переможця, поки учасники б'ються між собою, а фінал це дуель трьох
// на арені. Візуал лише показує: переможець обраний сервером до анімації і не може програти жоден бій.
export const meta = { id: "wild-1-royale", title: "Гарбузовий Рояль", author: "agent" };

const W = 1920, H = 1080;
// Хронологія ролу (секунди). Зона: [початок стискання, кінець]. F = початок фіналу.
const T = { LAND: 3.4, S: [[5.2, 10.2], [11.9, 16.7], [18.4, 22.4]], F: 22.4 };
const ZR = [1250, 560, 270, 118];
const COLORS = ["#ff6600", "#74b858", "#8a5fd0", "#d8452e", "#e0b84a"]; // pumpkins, orders, both, storm, gold
const CSS_URL = new URL("./style.css", import.meta.url).href;
const A = (n) => new URL(`./assets/${n}`, import.meta.url).href;
const SPR = (n) => new URL(`../../assets/sprites/${n}.png`, import.meta.url).href;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (u) => u * u * (3 - 2 * u);
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// Локації: центр спрайта у світових координатах 1920x1080, ширина відмальовування.
const POIS = [
  { n: "Гарбузове поле", k: "field", x: 410, y: 240, w: 300, h: 248 },
  { n: "Цвинтар", k: "yard", x: 1570, y: 230, w: 300, h: 278 },
  { n: "Маєток", k: "manor", x: 990, y: 470, w: 230, h: 404 },
  { n: "Болото", k: "swamp", x: 350, y: 720, w: 300, h: 188 },
  { n: "Магазин ChiSetup", k: "shop", x: 1540, y: 790, w: 230, h: 225 },
  { n: "Хатина відьми", k: "hut", x: 970, y: 200, w: 180, h: 206 },
];
// Декор: [проп, x, y, масштаб]. Запікається в карту, його мало: карта має лишатися чистою. prop4 = смолоскип.
const PROPS = [[0, 640, 610, 0.75], [0, 1330, 610, 0.75], [1, 700, 850, 0.7], [7, 1210, 330, 0.8], [7, 260, 560, 0.7]];
const TORCHES = [[880, 570], [1100, 570], [1450, 890], [1630, 890]];

export function mount(root, ctx) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = CSS_URL;
  document.head.append(link);

  root.classList.add("wr-root");
  root.innerHTML = `
    <div class="wr-stage">
      <canvas class="wr-c"></canvas>
      <div class="wr-hud">
        <div class="wr-counter"><div class="wr-alive"><small class="wr-al">УЧАСНИКІВ</small><b class="wr-n">0</b></div><div class="wr-zone"><small class="wr-zk">РАУНД</small><span class="wr-zv">1/5</span></div></div>
        <div class="wr-title"><i class="wr-sq"></i>ГАРБУЗОВИЙ РОЯЛЬ <i>·</i> ChiSetup Halloween</div>
        <div class="wr-prize"><canvas class="wr-chest" width="64" height="64"></canvas><div><small>РОЗІГРУЄМО</small><b class="wr-pn"></b><span class="wr-pi"></span></div></div>
        <div class="wr-feed"></div>
        <div class="wr-banner"></div>
        <div class="wr-bottom"><span class="wr-st"></span><span class="wr-lg"><canvas width="28" height="32"></canvas>гарбузи</span><span class="wr-lg"><canvas width="28" height="32"></canvas>замовлення</span><span class="wr-lg"><canvas width="28" height="32"></canvas>обидва</span><span class="wr-lg"><canvas width="28" height="32"></canvas>вже виграли</span></div>
        <div class="wr-bubble"></div>
        <div class="wr-cam"><b>MAX CAM</b><img alt="" src="${SPR("hero_blink")}"></div>
        <div class="wr-flash"></div>
        <div class="wr-win"><div class="wr-kicker"></div><div class="wr-emblemwrap"><div class="wr-emblem"></div></div><div class="wr-name"></div><div class="wr-sub"></div><div class="wr-prizewin"><canvas class="wr-chest" width="64" height="64"></canvas><span>ВИГРАВ: <b></b></span></div><img class="wr-hero" alt="" src="${SPR("hero_wave")}"></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const stage = $(".wr-stage"), canvas = $(".wr-c"), g = canvas.getContext("2d");
  const el = {
    n: $(".wr-n"), al: $(".wr-al"), zk: $(".wr-zk"), zv: $(".wr-zv"), zone: $(".wr-zone"), feed: $(".wr-feed"), banner: $(".wr-banner"),
    st: $(".wr-st"), bubble: $(".wr-bubble"), flash: $(".wr-flash"), win: $(".wr-win"), kicker: $(".wr-kicker"), emblem: $(".wr-emblem"),
    name: $(".wr-name"), sub: $(".wr-sub"), prize: $(".wr-prize"), pn: $(".wr-pn"), pi: $(".wr-pi"), prizewin: $(".wr-prizewin"), pwn: $(".wr-prizewin b"),
  };

  // ----- layout -----
  let fit = 1, bk = 1;
  function layout() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    fit = Math.min(w / W, h / H);
    stage.style.transform = `translate(${(w - W * fit) / 2}px, ${(h - H * fit) / 2}px) scale(${fit})`;
    bk = clamp(fit * (devicePixelRatio || 1), 0.5, 1);
    const cw = Math.round(W * bk), ch = Math.round(H * bk);
    if (canvas.width !== cw) { canvas.width = cw; canvas.height = ch; }
  }
  const onResize = () => layout();
  addEventListener("resize", onResize);
  layout();

  // ----- assets -----
  let alive = true;
  const IM = {}; // loaded images
  let AT = null; // atlas rects
  let landMask = null, landReady = false, map = null, mapDirty = true;
  const assetsP = (async () => {
    const names = ["terrain", "fighters", "atlas", "arena", "storm", "lm-field", "lm-yard", "lm-manor", "lm-swamp", "lm-shop", "lm-hut"];
    const [json, ...imgs] = await Promise.all([fetch(A("atlas.json")).then((r) => r.json()).catch(() => null), ...names.map((n) => loadImg(A(n + ".webp")))]);
    names.forEach((n, i) => { IM[n] = imgs[i]; });
    AT = json;
    const m = await loadImg(A("land.png"));
    if (m) {
      const c = document.createElement("canvas"); c.width = m.width; c.height = m.height;
      const x = c.getContext("2d"); x.drawImage(m, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; landMask = { w: c.width, h: c.height, a: new Uint8Array(c.width * c.height) };
      for (let i = 0; i < landMask.a.length; i++) landMask.a[i] = d[i * 4] > 128 ? 1 : 0;
      landReady = true;
    }
    if (!alive) return;
    mapDirty = true; initAmbient(); replaceAll(); legends(); chests();
  })();
  const isLand = (x, y) => {
    if (!landMask) return x > 90 && x < W - 90 && y > 90 && y < H - 90;
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return landMask.a[((y / H * landMask.h) | 0) * landMask.w + ((x / W * landMask.w) | 0)] === 1;
  };

  const stamps = COLORS.map((c) => {
    const s = document.createElement("canvas"); s.width = s.height = 48;
    const x = s.getContext("2d"), [r, gg, b] = hex(c);
    const gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, `rgba(${r},${gg},${b},0.42)`); gr.addColorStop(0.3, `rgba(${r},${gg},${b},0.18)`);
    gr.addColorStop(0.62, `rgba(${r},${gg},${b},0.05)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 48, 48);
    return s;
  });
  const flameStamp = (() => {
    const s = document.createElement("canvas"); s.width = s.height = 64; const x = s.getContext("2d");
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,200,90,0.9)"); gr.addColorStop(0.35, "rgba(255,110,20,0.38)"); gr.addColorStop(1, "rgba(255,80,0,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return s;
  })();
  const fogLayers = [0, 1].map((k) => {
    const s = document.createElement("canvas"); s.width = W / 2; s.height = H / 2; const x = s.getContext("2d");
    const r = rng(900 + k * 17);
    for (let i = 0; i < 22; i++) {
      const bx = r() * s.width, by = r() * s.height, rad = 70 + r() * 120;
      for (const ox of [-s.width, 0, s.width]) for (const oy of [-s.height, 0, s.height]) {
        const gr = x.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, rad);
        gr.addColorStop(0, "rgba(160,175,195,0.04)"); gr.addColorStop(1, "rgba(160,175,195,0)");
        x.fillStyle = gr; x.fillRect(bx + ox - rad, by + oy - rad, rad * 2, rad * 2);
      }
    }
    return s;
  });
  let stormPat = null;
  const corpse = document.createElement("canvas"); corpse.width = W; corpse.height = H;
  const cg = corpse.getContext("2d");
  const avatars = new Map();
  function avatarOf(url) {
    if (!url || !ctx.privacy?.avatars) return null;
    let a = avatars.get(url);
    if (!a) { a = new Image(); a.src = url; a.onerror = () => { a.bad = true; }; avatars.set(url, a); }
    return a.complete && a.naturalWidth && !a.bad ? a : null;
  }

  // draw an atlas sprite on any 2d context
  function aspr(c, name, x, y, sc = 1, flip = false, rot = 0) {
    const a = AT && AT[name]; if (!a || !IM.atlas) return;
    const [sx, sy, w, h, ax, ay] = a;
    if (!flip && !rot) { c.drawImage(IM.atlas, sx, sy, w, h, x - ax * w * sc, y - ay * h * sc, w * sc, h * sc); return; }
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (flip) c.scale(-1, 1);
    c.drawImage(IM.atlas, sx, sy, w, h, -ax * w * sc, -ay * h * sc, w * sc, h * sc); c.restore();
  }
  function legends() {
    root.querySelectorAll(".wr-lg canvas").forEach((cv, i) => { const x = cv.getContext("2d"); x.clearRect(0, 0, 28, 32); aspr(x, "tok" + [0, 1, 2, 3][i], 14, 17, 0.3); });
  }
  function chests() {
    root.querySelectorAll(".wr-chest").forEach((cv) => { const x = cv.getContext("2d"); x.clearRect(0, 0, 64, 64); aspr(x, "chest", 32, 32, 0.42); });
  }

  // ----- baked map -----
  function bakeMap() {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d"); c.imageSmoothingEnabled = false;
    if (IM.terrain) c.drawImage(IM.terrain, 0, 0, W, H); else { c.fillStyle = "#14101e"; c.fillRect(0, 0, W, H); }
    // faint tactical grid
    c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,0.045)";
    for (let i = 1; i < 16; i++) { c.beginPath(); c.moveTo(i * 120 + 0.5, 0); c.lineTo(i * 120 + 0.5, H); c.stroke(); }
    for (let j = 1; j < 9; j++) { c.beginPath(); c.moveTo(0, j * 120 + 0.5); c.lineTo(W, j * 120 + 0.5); c.stroke(); }
    c.fillStyle = "rgba(255,255,255,0.22)"; c.font = '700 14px "Exo 2", sans-serif'; c.textAlign = "left"; c.textBaseline = "top";
    for (let i = 0; i < 16; i++) c.fillText(String.fromCharCode(65 + i), i * 120 + 6, 5);
    for (let j = 0; j < 9; j++) c.fillText(String(j + 1), 6, j * 120 + 6);
    // objects sorted by y (props + landmarks)
    const objs = [];
    for (const p of PROPS) objs.push({ y: p[2], f: () => aspr(c, "prop" + p[0], p[1], p[2], p[3]) });
    for (const [x, y] of TORCHES) objs.push({ y, f: () => aspr(c, "prop4", x, y, 0.8) });
    for (const p of POIS) objs.push({ y: p.y + p.h / 2, f: () => { const im = IM["lm-" + p.k]; if (im) { c.fillStyle = "rgba(0,0,0,0.28)"; c.beginPath(); c.ellipse(p.x, p.y + p.h * 0.36, p.w * 0.46, p.h * 0.17, 0, 0, 6.283); c.fill(); c.drawImage(im, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h); } } });
    objs.sort((a, b) => a.y - b.y).forEach((o) => o.f());
    // name plates
    c.textAlign = "center"; c.textBaseline = "middle"; c.font = '800 19px "Exo 2", sans-serif';
    for (const p of POIS) {
      const t = p.n.toUpperCase(), tw = c.measureText(t).width + 26, x = p.x, y = Math.min(H - 150, p.y + p.h / 2 + 4), h = 30;
      c.fillStyle = "rgba(14,14,16,0.82)"; c.fillRect(x - tw / 2, y - h / 2, tw, h);
      c.fillStyle = "#ff6600"; c.fillRect(x - tw / 2, y + h / 2 - 3, tw, 3); c.fillRect(x - tw / 2 - 3, y - h / 2 + 3, 3, h - 6); c.fillRect(x + tw / 2, y - h / 2 + 3, 3, h - 6);
      c.fillStyle = "#fff1de"; c.fillText(t, x, y);
    }
    map = cv; mapDirty = false;
  }
  document.fonts?.load('800 19px "Exo 2"').then(() => { mapDirty = true; }).catch(() => {});

  // ----- ambient life -----
  let shore = [], bubbles = [], bats = [];
  function initAmbient() {
    if (!AT) return;
    const r = rng(4242); shore = [];
    if (landMask) for (let k = 0; k < 9000 && shore.length < 170; k++) {
      const x = r() * W, y = r() * H; if (isLand(x, y)) continue;
      let near = false; for (let a = 0; a < 6 && !near; a++) { const q = a * 1.047; if (isLand(x + Math.cos(q) * 36, y + Math.sin(q) * 36)) near = true; }
      if (near || r() < 0.06) shore.push({ x, y, ph: r() * 6.28, sp: 0.6 + r() * 1.5, s: r() < 0.3 ? 4 : 3 });
    }
    const sw = POIS[3]; bubbles = [];
    for (let i = 0; i < 0; i++) bubbles.push({ x: sw.x - 20 + (r() - 0.5) * 300, y: sw.y - 10 + (r() - 0.5) * 120, ph: r() * 3, per: 2 + r() * 2.2 });
    bats = [];
    for (let i = 0; i < 3; i++) { const p = POIS[[2, 1, 5][i]]; bats.push({ cx: p.x, cy: p.y - 40, rx: 150 + r() * 120, ry: 50 + r() * 50, sp: (0.4 + r() * 0.5) * (r() < 0.5 ? -1 : 1), ph: r() * 6.28, fp: r() * 3 }); }
  }

  // ----- state -----
  let now = 0, last = performance.now(), raf = 0;
  let dots = [], byId = new Map();
  let phase = "idle"; // idle | roll | win
  let N = 0, mult = 1, fmult = 1, KF = 0;
  let st = 0, info = null, winnerDot = null, fin = [], fightersAlive = [], tokensAlive = [], zones = [], targets = null;
  let scriptI = 0, script = [], kills = 0, winnerKills = 0;
  let cam = { x: W / 2, y: H / 2, s: 1 }, shake = 0, lastFeed = 0, lastTick = 0, lastShotSnd = 0;
  const particles = [], bullets = [], fxs = [], confetti = [], feedRows = [], fights = [], labelRects = [];
  let radarA = 0, hudAlive = -1, rollResolve = null, lastStage = -1, lastFight = 0, featureI = 0, features = [], tokQuota = 0;
  let prize = null, firstSet = true, bornAt = 0, winAt = 0;
  const onehp = () => { banner("1 HP !!!", "red", 3.4, 2, true); say("НІІІІ!", 3.2, 2); flash(); shake = ctx.reducedMotion ? 0 : 20; };

  // ----- message queues: nothing is replaced before it has been on screen long enough to be read -----
  function makeQueue(node, activeCls, minHold) {
    const q = { cur: null, until: 0, items: [] };
    q.push = (text, cls = "", hold = minHold, prio = 1, urgent = false) => {
      if (prio === 0 && (q.items.length || (q.cur && now < q.until))) return;
      if (urgent) q.items = q.items.filter((i) => i.prio >= 2);
      q.items.push({ text, cls, hold: Math.max(hold, minHold), prio });
      if (q.items.length > 3) { const i = q.items.findIndex((x) => x.prio < 2); if (i >= 0) q.items.splice(i, 1); }
    };
    q.tick = () => {
      if ((!q.cur || now >= q.until) && q.items.length) {
        const it = q.items.shift(); q.cur = it; q.until = now + it.hold;
        node.textContent = it.text; node.className = node.className.split(" ")[0] + " " + activeCls + " " + it.cls;
        void node.offsetWidth;
      } else if (q.cur && now >= q.until && !q.items.length) { node.classList.remove(activeCls); q.cur = null; }
    };
    q.clear = () => { q.items = []; q.cur = null; q.until = 0; node.classList.remove(activeCls); };
    return q;
  }
  const bq = makeQueue(el.banner, "on", 2.7), sq = makeQueue(el.bubble, "on", 2.8);
  const banner = (t, cls, hold, prio, urgent) => bq.push(t, cls, hold, prio, urgent);
  const say = (t, hold, prio) => sq.push(t, "", hold, prio);
  function flash(cls = "") {
    if (ctx.reducedMotion) return;
    el.flash.className = "wr-flash " + cls; void el.flash.offsetWidth; el.flash.className = "wr-flash go " + cls;
  }
  function feed(a, mid, b, cls, icon, important) {
    const gap = important ? 0.3 : 0.5;
    if (now - lastFeed < gap) return;
    lastFeed = now;
    const row = document.createElement("div");
    row.className = "wr-kf " + cls;
    const mk = (c, t) => { const s = document.createElement("span"); s.className = c; s.textContent = t; row.append(s); return s; };
    if (icon) mk("ic", icon);
    if (a) mk("k", a);
    if (mid) mk("m", mid);
    mk("v", b);
    el.feed.append(row);
    feedRows.push({ row, t: now });
    while (feedRows.length > 7) feedRows.shift().row.remove();
  }

  // ----- prize -----
  function setPrize(p) {
    prize = p && p.name ? p : null;
    el.prize.classList.toggle("on", !!prize);
    if (prize) { el.pn.textContent = prize.name; el.pi.textContent = (prize.items || []).slice(0, 4).join(" · "); el.pi.style.display = prize.items?.length ? "" : "none"; }
  }

  // ----- participants -----
  const tierOf = (p) => { const t = p.tickets || 1; return t >= 8 ? 3 : t >= 4 ? 2 : t >= 2 ? 1 : 0; };
  function place(d) {
    const rnd = rng(hash(d.id)); let x = 0, y = 0;
    for (let k = 0; k < 60; k++) {
      x = 70 + rnd() * (W - 140); y = 80 + rnd() * (H - 160);
      if (!isLand(x, y)) continue;
      let inside = false; for (const p of POIS) if (Math.abs(x - p.x) < p.w * 0.36 && Math.abs(y - p.y) < p.h * 0.34) inside = true;
      if (inside && rnd() < 0.8) continue;
      break;
    }
    d.hx = d.bx = d.x = x; d.hy = d.by = d.y = y; d.ph = rnd() * 6.283; d.sp = 0.5 + rnd(); d.grace = 0.3 + rnd() * 1.4;
  }
  function replaceAll() { for (const d of dots) { if (!d.placedReady) { place(d); d.placedReady = landReady; } } }
  function mkDot(p, delay, air) {
    const d = { p, id: p.id, alive: true, spawn: now + delay, dur: air ? 1.7 : 0.55, air: !!air, out: 0, role: 0, hp: 1, won: false, fighter: false, busy: false, doomed: false, face: 1, hurt: 0, kvx: 0, kvy: 0, shoot: 0, mv: 0, kills: 0, wander: 0, tx: 0, ty: 0 };
    place(d); d.placedReady = landReady; return d;
  }
  function style(d) {
    const p = d.p;
    d.col = p.via?.includes("pumpkins") && p.via.includes("orders") ? 2 : p.via?.includes("orders") ? 1 : 0;
    d.tier = tierOf(p);
  }
  function recount() {
    const pool = dots.filter((d) => !d.won);
    N = pool.length;
    KF = N <= 40 ? N : Math.min(64, Math.round(40 + (N - 40) / 6));
    fmult = N <= 8 ? 1.9 : N <= 16 ? 1.55 : N <= 32 ? 1.25 : N <= 60 ? 1.08 : 1;
    mult = N <= 20 ? 2.4 : Math.max(1, 1 + 1.4 * (1 - Math.log(N / 20) / Math.log(100)));
    for (const d of dots) style(d);
    const sorted = pool.slice().sort((a, b) => (b.p.tickets || 0) - (a.p.tickets || 0) || (hash(a.id) - hash(b.id)));
    sorted.forEach((d, i) => { d.fighter = i < KF || d.role > 0; });
    for (const d of dots) if (d.won) d.fighter = false;
  }
  function setParticipants(list) {
    const seen = new Set(); const initial = firstSet && now < 2; firstSet = false;
    for (const p of list) {
      seen.add(p.id);
      let d = byId.get(p.id);
      if (!d) { d = mkDot(p, initial ? Math.random() * 0.7 : phase === "idle" ? 0.1 : 0, !initial && now > 3); byId.set(p.id, d); dots.push(d); }
      d.p = p; d.won = !!p.won;
      if (d.won) d.alive = false; else if (phase === "idle" && !d.alive) d.alive = true;
    }
    dots = dots.filter((d) => { if (seen.has(d.id)) return true; byId.delete(d.id); return false; });
    recount();
    if (phase === "idle") hudIdle();
  }
  function hudIdle() {
    el.al.textContent = "УЧАСНИКІВ"; el.n.textContent = N; hudAlive = N;
    el.zk.textContent = "ЕФІР"; el.zv.textContent = "РОЗІГРАШ";
    const tix = dots.reduce((s, d) => s + (d.won ? 0 : d.p.tickets || 0), 0);
    el.st.textContent = `Учасники: ${N} · Квитки: ${tix}`;
  }

  // ----- names plates (cached canvases) -----
  const labelCache = new Map();
  function labelOf(d, hot) {
    const av = avatarOf(d.p.avatar);
    const key = d.id + (hot ? "h" : "n") + (av ? "a" : "") + (d.won ? "w" : "");
    let l = labelCache.get(key);
    if (l) return l;
    const fs = hot ? 22 : 15, text = (d.won ? "★ " : "") + d.p.name, pad = 7, aw = av ? fs + 4 : 0;
    const m = document.createElement("canvas").getContext("2d"); m.font = `800 ${fs}px "Exo 2", sans-serif`;
    const tw = Math.ceil(m.measureText(text).width), w = tw + pad * 2 + aw, h = fs + 10, k = 2;
    const cv = document.createElement("canvas"); cv.width = w * k; cv.height = h * k; const c = cv.getContext("2d"); c.scale(k, k);
    c.fillStyle = hot ? "rgba(14,14,16,0.9)" : "rgba(14,14,16,0.72)"; c.fillRect(2, 0, w - 4, h); c.fillRect(0, 2, w, h - 4);
    c.fillStyle = d.won ? "#ffd24a" : hot ? "#ff6600" : COLORS[d.col || 0]; c.fillRect(2, h - 2, w - 4, 2);
    if (av) { c.save(); c.beginPath(); c.arc(pad + fs / 2 + 1, h / 2 - 1, fs / 2 + 1, 0, 6.283); c.clip(); try { c.drawImage(av, pad - 1, h / 2 - fs / 2 - 2, fs + 2, fs + 2); } catch (e) { /* ignore */ } c.restore(); }
    c.font = `800 ${fs}px "Exo 2", sans-serif`; c.textBaseline = "middle"; c.fillStyle = d.won ? "#ffe9a8" : hot ? "#fff" : "#ffe9d6"; c.fillText(text, pad + aw, h / 2 - 1);
    l = { cv, w, h }; labelCache.set(key, l);
    if (labelCache.size > 500) labelCache.delete(labelCache.keys().next().value);
    return l;
  }
  function drawLabel(d, x, y, s, hot) {
    const l = labelOf(d, hot), w = l.w / s, h = l.h / s, bx = x - w / 2, by = y - h;
    for (const r of labelRects) if (bx < r[2] && bx + w > r[0] && by < r[3] && by + h > r[1]) return false;
    labelRects.push([bx, by, bx + w, by + h]);
    g.drawImage(l.cv, bx, by, w, h); return true;
  }

  // ----- fx -----
  function burst(x, y, col, n = 7, spd = 90, sz = 3) {
    for (let i = 0; i < n && particles.length < 700; i++) {
      const a = Math.random() * 6.283, v = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.4 + Math.random() * 0.5, col, sz: sz * (0.7 + Math.random() * 0.8) });
    }
  }
  function fx(kind, x, y, sc = 1, flip = false, rot = 0, fps = 14) { if (fxs.length < 320) fxs.push({ kind, x, y, sc, flip, rot, t: 0, fps }); }
  function mark(d) {
    if (d.fighter) { cg.globalAlpha = 0.55; aspr(cg, "prop9", d.x, d.y + 4, 0.34); cg.globalAlpha = 1; }
    else { cg.fillStyle = "rgba(0,0,0,0.35)"; cg.fillRect(Math.round(d.x - 2), Math.round(d.y - 1), 4, 3); }
  }
  const sizeOf = (d) => [54, 61, 70, 80][d.tier] * fmult;
  const tokSize = (d) => [17, 21, 27, 33][d.tier] * mult;
  function killDot(v, by, cause) {
    if (!v.alive || v.role === 1) return;
    v.alive = false;
    removeFrom(fightersAlive, v); removeFrom(tokensAlive, v);
    mark(v);
    const big = v.fighter;
    if (big) fx("poof", v.x, v.y + 6, 0.95); else if (fxs.length < 220) fx("poof", v.x, v.y, 0.36);
    burst(v.x, v.y - 10, COLORS[v.col], big ? 10 : N > 600 ? 2 : 5, big ? 130 : 80, big ? 3.4 : 2.4);
    if (by && by !== v) { by.kills = (by.kills || 0) + 1; if (by === winnerDot) winnerKills++; }
    kills++;
    const hero = v.role > 0 || (by && by.role > 0);
    if (big) {
      if (by && by !== v && cause !== "zone") feed(by.p.name, "вибив", v.p.name, hero ? "hero" : "", "✕", hero);
      else feed("", "згорів у шторм", v.p.name, "zone", "▼", hero);
    }
    if (now - lastTick > 0.06) { lastTick = now; ctx.sound?.("tick"); }
    if (v.role === 2 && phase === "roll" && fin.filter((f) => f.alive).length === 2) { banner("ЛИШИЛОСЬ 2", "red", 2.8, 2, true); ctx.sound?.("boom"); shake = ctx.reducedMotion ? 0 : 12; }
  }
  function removeFrom(arr, v) { const i = arr.indexOf(v); if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); } }

  // ----- bullets and fights -----
  const BUL = ["b_seed", "b_green", "b_violet", "b_gold"];
  const gunPos = (d) => { const s = sizeOf(d); return [d.x + d.face * s * 0.5, d.y - s * 0.4]; };
  function fire(k, tx, ty, opt = {}) {
    const [mx, my] = k.fighter ? gunPos(k) : [k.x, k.y - 6];
    const dx = tx - mx, dy = ty - my, dist = Math.hypot(dx, dy) || 1, sp = opt.speed || 780;
    k.face = dx >= 0 ? 1 : -1; k.shoot = 0.16;
    if (bullets.length < 160) bullets.push({ x: mx, y: my, sx: mx, sy: my, ang: Math.atan2(dy, dx), vx: dx / dist * sp, vy: dy / dist * sp, ttl: dist / sp, t: 0, kind: BUL[k.col] || "b_seed", cb: opt.cb || null, big: k.fighter, tx, ty, owner: k });
    if (k.fighter) fx("muz", mx, my, 0.4, false, Math.atan2(dy, dx), 22);
    if (now - lastShotSnd > 0.09 && k.fighter) { lastShotSnd = now; ctx.sound?.("tick"); }
  }
  function hurt(v, from, force = 190) {
    v.hurt = 0.3;
    const a = Math.atan2(v.y - from.y, v.x - from.x); v.kvx = Math.cos(a) * force; v.kvy = Math.sin(a) * force * 0.6;
  }
  function startFight(k, v, o = {}) {
    k.busy = v.busy = true; v.doomed = !o.nonlethal;
    fights.push({ k, v, t: 0, n: o.n || 3 + ((Math.random() * 3) | 0), fired: 0, nextK: 0, nextV: 0.5, R: o.R || 175 + Math.random() * 60, hero: !!o.hero, spd: o.spd || 150, done: false, dieAt: -1, nonlethal: !!o.nonlethal, onEnd: o.onEnd || null });
  }
  function stepFights(dt) {
    for (let i = fights.length - 1; i >= 0; i--) {
      const f = fights[i], { k, v } = f; f.t += dt;
      const end = () => { k.busy = v.busy = false; if (v.alive) v.doomed = false; fights.splice(i, 1); f.onEnd?.(); };
      if (!k.alive || (!v.alive && f.dieAt < 0)) { end(); continue; }
      if (f.dieAt >= 0) { if (f.t >= f.dieAt) { if (f.nonlethal) { end(); } else { killDot(v, k, "fight"); end(); } } continue; }
      const dx = v.bx - k.bx, dy = v.by - k.by, dist = Math.hypot(dx, dy) || 1;
      k.face = dx >= 0 ? 1 : -1; v.face = -k.face;
      if (dist > f.R) { const m = Math.min(dist - f.R + 4, f.spd * dt); k.bx += dx / dist * m; k.by += dy / dist * m; k.mv = 0.2; }
      else {
        if (f.t >= f.nextK && f.fired < f.n) {
          f.fired++; f.nextK = f.t + (f.hero ? 0.46 : 0.34);
          const last = f.fired === f.n;
          if (last) fire(k, v.x, v.y - sizeOf(v) * 0.4, { cb: () => { hurt(v, k, f.nonlethal ? 240 : 190); fx("hit", v.x, v.y - sizeOf(v) * 0.42, 0.7); burst(v.x, v.y - 20, "#e89a4a", 10, 150, 3); if (!ctx.reducedMotion) shake = Math.max(shake, f.hero ? 12 : 5); if (f.hero) ctx.sound?.("boom"); f.dieAt = f.t + 0.34; if (f.nonlethal) v.hp = 0.08; } });
          else { const off = (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 30); const nx = -dy / dist, ny = dx / dist; fire(k, v.x + nx * off, v.y - sizeOf(v) * 0.4 + ny * off, { cb: null }); }
        }
        if (f.t >= f.nextV && f.fired < f.n && v.fighter) {
          f.nextV = f.t + 0.5; const off = (Math.random() < 0.5 ? -1 : 1) * (34 + Math.random() * 34); const nx = dy / dist, ny = -dx / dist;
          fire(v, k.x + nx * off, k.y - sizeOf(k) * 0.4 + ny * off);
        }
      }
    }
  }
  function stepBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.t >= b.ttl) {
        if (b.cb) b.cb(); else { fx("hit", b.tx, b.ty, 0.45, false, 0, 18); burst(b.tx, b.ty, "#e89a4a", 3, 70, 2); }
        bullets.splice(i, 1);
      }
    }
  }

  // ----- roll -----
  const ez = (u) => u * 0.55 + smooth(u) * 0.45;
  function buildZones(w) {
    const rn = Math.random, mk = (r, k, rr) => {
      for (let n = 0; n < 24; n++) { const a = rn() * 6.283, d = rn() * k * r; const x = w.bx + Math.cos(a) * d, y = w.by + Math.sin(a) * d; if (isLand(x, y) || n === 23) return { x: isLand(x, y) ? x : w.bx, y: isLand(x, y) ? y : w.by, r: rr }; }
    };
    return [{ x: W / 2, y: H / 2, r: ZR[0] }, mk(ZR[1], 0.5, ZR[1]), mk(ZR[2], 0.45, ZR[2]), mk(ZR[3], 0.25, ZR[3])];
  }
  function zoneAt(t) {
    for (let i = 0; i < 3; i++) {
      const [a, b] = T.S[i];
      if (t < a) return { ...zones[i], next: zones[i + 1], shrink: false, stage: i + 1, wait: a - t };
      if (t < b) { const u = ez((t - a) / (b - a)), A0 = zones[i], B = zones[i + 1]; return { x: lerp(A0.x, B.x, u), y: lerp(A0.y, B.y, u), r: lerp(A0.r, B.r, u), next: B, shrink: true, stage: i + 1, wait: 0 }; }
    }
    return { ...zones[3], next: null, shrink: false, stage: 4, wait: 0 };
  }
  const curve = (pts, t) => { for (let i = 1; i < pts.length; i++) if (t < pts[i][0]) { const u = (t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return lerp(pts[i - 1][1], pts[i][1], smooth(clamp(u, 0, 1))); } return pts[pts.length - 1][1]; };

  function roll(winner, inf) {
    return new Promise((resolve) => {
      info = inf || { round: 1, totalRounds: 5, totalTickets: 0, seedHash: "" }; rollResolve = resolve;
      if (info && "prize" in info) setPrize(info.prize);
      let wd = byId.get(winner.id);
      if (!wd) { wd = mkDot(winner, 0); byId.set(winner.id, wd); dots.push(wd); }
      wd.p = winner; wd.won = false;
      for (const d of dots) { if (!d.won) d.alive = true; d.busy = d.doomed = false; d.hurt = 0; d.kvx = d.kvy = 0; }
      fights.length = 0; bullets.length = 0; fxs.length = 0; cg.clearRect(0, 0, W, H);
      winnerDot = wd; kills = 0; winnerKills = 0;
      const others = dots.filter((d) => d !== wd && !d.won).sort((a, b) => (a.hx - wd.hx) ** 2 + (a.hy - wd.hy) ** 2 - ((b.hx - wd.hx) ** 2 + (b.hy - wd.hy) ** 2));
      const decoys = others.slice(0, 2);
      fin = [wd, ...decoys];
      for (const d of dots) { d.role = 0; d.out = 0; d.kills = 0; d.bx = d.hx; d.by = d.hy; }
      fin.forEach((d, i) => { d.role = i === 0 ? 1 : 2; d.hp = 1; d.slot = i; });
      for (const d of dots) d.hp = 1;
      recount();
      fightersAlive = dots.filter((d) => !d.won && d.role === 0 && d.fighter);
      tokensAlive = dots.filter((d) => !d.won && d.role === 0 && !d.fighter);
      zones = buildZones(wd);
      const F = fin.length, F0 = fightersAlive.length, T0 = tokensAlive.length;
      targets = {
        F, F0, T0,
        f: [[0, F0], [T.LAND, F0], [T.S[0][1], Math.min(F0, Math.max(2, Math.round(F0 * 0.62)))], [T.S[1][1], Math.min(F0, Math.max(1, Math.round(F0 * 0.26)))], [T.S[2][1] - 1, 0]],
        t: [[0, T0], [T.LAND, T0], [T.S[0][1], Math.round(T0 * 0.2)], [T.S[1][1], Math.round(T0 * 0.03)], [T.S[2][1] - 1, 0]],
      };
      // landing: fighters descend on parachutes, staggered
      for (const d of dots) { if (d.won) continue; if (d.fighter) { d.air = true; d.dur = 2.0; d.spawn = now + Math.random() * (T.LAND - 2.3); } else { d.air = false; d.spawn = 0; d.dur = 0.55; } }
      // scripted finale (relative to T.F)
      script = []; winAt = 0;
      const [d1, d2] = decoys, FT = T.F, done = () => { winAt = st + 1.2; };
      if (F === 3) {
        script.push({ t: FT + 2.8, f: () => startFight(d1, d2, { n: 5, hero: true, R: 120, spd: 140 }) });
        script.push({ t: FT + 6.6, f: () => startFight(d1, wd, { n: 3, hero: true, R: 120, nonlethal: true, spd: 140, onEnd: onehp }) });
        script.push({ t: FT + 10.2, f: () => startFight(wd, d1, { n: 4, hero: true, R: 110, spd: 140, onEnd: done }) });
      } else if (F === 2) {
        script.push({ t: FT + 2.8, f: () => startFight(d1, wd, { n: 3, hero: true, R: 120, nonlethal: true, spd: 140, onEnd: onehp }) });
        script.push({ t: FT + 6.4, f: () => startFight(wd, d1, { n: 4, hero: true, R: 110, spd: 140, onEnd: done }) });
      } else winAt = 6.5;
      script.push({ t: Infinity, f: () => {} });
      scriptI = 0; featureI = 0;
      // staged hero fights: the winner (and decoys) beat somebody on the way
      features = [{ t: 7.2, who: wd }, { t: 9.4, who: decoys[0] }, { t: 13.6, who: wd }, { t: 15.0, who: decoys[1] }, { t: 19.4, who: wd }].filter((x) => x.who);
      st = 0; phase = "roll"; lastStage = -1; lastFight = 0; tokQuota = 0;
      bq.clear(); sq.clear();
      el.win.classList.remove("on"); el.al.textContent = "ЖИВИХ"; el.n.textContent = N; hudAlive = N;
      el.zk.textContent = `РАУНД ${info.round}/${info.totalRounds}`; el.zv.textContent = "ВИСАДКА";
      el.st.textContent = `Квитки: ${info.totalTickets} · seed ${String(info.seedHash || "").slice(0, 8)}`;
      banner("ВИСАДКА", "green", 2.8, 2); say("ПОЇХАЛИ!!!", 2.8, 2);
      ctx.sound?.("drum"); ctx.sound?.("whoosh"); flash();
    });
  }

  function showWin() {
    phase = "win";
    const w = winnerDot.p;
    bq.clear(); sq.clear();
    el.kicker.textContent = `ПЕРЕМОЖЕЦЬ · РАУНД ${info.round}/${info.totalRounds}`;
    el.name.textContent = w.name;
    el.name.style.fontSize = Math.min(128, Math.floor((W - 160) / (Math.max(6, w.name.length) * 0.62))) + "px";
    const chance = info.totalTickets ? ((w.tickets / info.totalTickets) * 100) : 0;
    el.sub.innerHTML = `${w.handle ? w.handle + " · " : ""}Квитки: <b>${w.tickets}</b> · шанс ${chance < 10 ? chance.toFixed(1) : Math.round(chance)}%`;
    el.emblem.innerHTML = "";
    const av = ctx.privacy?.avatars && w.avatar;
    if (av) { const im = new Image(); im.src = w.avatar; im.onerror = () => { el.emblem.textContent = initial(w.name); }; el.emblem.append(im); }
    else el.emblem.textContent = initial(w.name);
    el.prizewin.classList.toggle("on", !!prize); if (prize) el.pwn.textContent = prize.name;
    el.win.classList.add("on");
    el.al.textContent = "ЖИВИХ"; el.n.textContent = 1; hudAlive = 1;
    el.zk.textContent = "ПЕРЕМОГА"; el.zv.textContent = "#1"; el.zone.classList.remove("hot");
    if (!ctx.reducedMotion) for (let i = 0; i < 50; i++) confetti.push({ x: Math.random() * W, y: -Math.random() * H * 0.8, vy: 120 + Math.random() * 260, vx: (Math.random() - 0.5) * 120, c: COLORS[(Math.random() * 3) | 0], s: 4 + ((Math.random() * 3) | 0) * 2, rot: Math.random() * 6 });
    ctx.sound?.("win"); ctx.sound?.("boom"); say("ГГ!!! ВІТАЮ!!!", 4.5, 2);
    flash("white"); shake = ctx.reducedMotion ? 0 : 16;
    setTimeout(() => { const r = rollResolve; rollResolve = null; r?.(); }, 700);
  }
  const initial = (n) => (n.trim()[0] || "?").toUpperCase();

  function reset() {
    phase = "idle"; winnerDot = null; fin = []; fightersAlive = []; tokensAlive = []; fights.length = 0;
    for (const d of dots) { d.role = 0; d.hp = 1; d.out = 0; d.busy = d.doomed = false; d.hurt = 0; d.alive = !d.won; d.air = false; d.spawn = 0; d.bx = d.hx; d.by = d.hy; d.x = d.hx; d.y = d.hy; d.kvx = d.kvy = 0; }
    cg.clearRect(0, 0, W, H); particles.length = 0; bullets.length = 0; fxs.length = 0; confetti.length = 0;
    el.win.classList.remove("on"); bq.clear(); sq.clear(); el.zone.classList.remove("hot");
    for (const r of feedRows) r.row.remove(); feedRows.length = 0;
    cam = { x: W / 2, y: H / 2, s: 1 }; shake = 0;
    const r = rollResolve; rollResolve = null; r?.();
    recount(); hudIdle();
  }

  // ----- simulation -----
  function nearestFighter(x, y, pred, maxD = 1e9) {
    let best = null, bd = maxD * maxD;
    for (const d of fightersAlive) { if (!pred(d)) continue; const dd = (d.bx - x) ** 2 + (d.by - y) ** 2; if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  function pickFight(z) {
    const free = fightersAlive.filter((d) => !d.busy && !d.doomed && d.air !== true);
    if (free.length < 1) return;
    // victim: prefer someone outside/near the storm edge
    let v = null, bs = -1e9;
    for (let k = 0; k < 8; k++) { const c = free[(Math.random() * free.length) | 0]; const sc = Math.hypot(c.bx - z.x, c.by - z.y) - z.r + Math.random() * 160; if (sc > bs) { bs = sc; v = c; } }
    const pool = fightersAlive.filter((d) => !d.busy && d !== v && d.air !== true);
    let k = null, bd = 1e12;
    for (const c of pool) { const dd = (c.bx - v.bx) ** 2 + (c.by - v.by) ** 2; if (dd < bd) { bd = dd; k = c; } }
    if (!k || bd > 900 * 900) return;
    startFight(k, v);
  }
  function snipeToken(t, z) {
    // a fighter in range takes the shot, otherwise the storm does it
    let shooter = null;
    if (bullets.length < 60 && fightersAlive.length) for (let n = 0; n < 4; n++) { const c = fightersAlive[(Math.random() * fightersAlive.length) | 0]; if (c && !c.air && Math.hypot(c.x - t.x, c.y - t.y) < 420) { shooter = c; break; } }
    t.doomed = true;
    removeFrom(tokensAlive, t);
    if (shooter) { t.alive = true; const fn = () => { killDot(t, shooter, "fight"); }; fire(shooter, t.x, t.y - 4, { cb: fn, speed: 900 }); tokensDead.push(t); }
    else killDot(t, null, "zone");
  }
  const tokensDead = [];

  function stepRoll(dt) {
    st += dt;
    const z = zoneAt(st);
    const stageKey = st < T.LAND ? 0 : st < T.S[0][0] ? 1 : st < T.S[0][1] ? 1.1 : st < T.S[1][0] ? 1.5 : st < T.S[1][1] ? 2 : st < T.S[2][0] ? 2.5 : st < T.S[2][1] ? 3 : 4;
    if (stageKey !== lastStage) {
      lastStage = stageKey;
      if (stageKey === 1) { banner("ЗОНА 1 · ЗАКРИВАЄТЬСЯ", "red", 3, 2); ctx.sound?.("whoosh"); }
      if (stageKey === 1.1) { say("ХТО НЕ ВСТИГ?!", 3, 1); }
      if (stageKey === 1.5) { banner("ЗОНА 2 · ТІСНІШЕ!", "red", 3, 2); ctx.sound?.("whoosh"); flash(); }
      if (stageKey === 2) { say("ТІКАЙТЕ!!!", 3, 1); }
      if (stageKey === 2.5) { banner("ОСТАННЯ ЗОНА", "red", 3, 2); ctx.sound?.("whoosh"); flash(); }
      if (stageKey === 3) { say("ЛИШИЛОСЬ ТРОХИ...", 3, 1); }
      if (stageKey === 4) { banner(fin.length >= 3 ? "ФІНАЛ · ЛИШИЛОСЬ 3" : "ФІНАЛ", "green", 3, 2, true); ctx.sound?.("boom"); shake = ctx.reducedMotion ? 0 : 10; }
      if (stageKey === 1.5 || stageKey === 2.5) ctx.sound?.("boom");
    }
    if (stageKey >= 1 && stageKey < 4 && Math.floor(st * 1.4) !== Math.floor((st - dt) * 1.4)) ctx.sound?.("tick");
    if (stageKey >= 4 && Math.floor(st / 0.8) !== Math.floor((st - dt) / 0.8)) ctx.sound?.("drum");
    el.zone.classList.toggle("hot", z.shrink);
    el.zk.textContent = stageKey >= 4 ? "ФІНАЛ" : stageKey < 1 ? "ВИСАДКА" : `ЗОНА ${Math.min(3, z.stage)}/3`;
    el.zv.textContent = stageKey >= 4 ? "ДУЕЛЬ" : stageKey < 1 ? "ВІДЛІК" : z.shrink ? "ЗАКРИВАЄТЬСЯ" : `0:0${Math.max(0, Math.ceil(z.wait))}`;

    // movement + zone damage
    const duel = st >= T.F, arenaZ = zones[3];
    for (const d of dots) {
      if (!d.alive || (d.air && now < d.spawn + d.dur)) continue;
      const dxz = d.bx - z.x, dyz = d.by - z.y, dist = Math.hypot(dxz, dyz) || 1;
      if (d.role > 0) {
        if (d.busy && duel) continue;
        let tx, ty, sp;
        if (duel || st > T.S[2][0]) { const a = d.slot * 2.094 + 0.7; tx = arenaZ.x + Math.cos(a) * 62; ty = arenaZ.y + Math.sin(a) * 50; sp = 170; if (!duel && dist < z.r - 30) { tx = d.bx; ty = d.by; } }
        else if (dist > z.r - 40) { tx = z.x; ty = z.y; sp = 230; } else { tx = d.bx; ty = d.by; sp = 0; }
        const dd = Math.hypot(tx - d.bx, ty - d.by);
        if (dd > 1 && sp && !(d.busy)) { const m = Math.min(dd, sp * dt); d.bx += (tx - d.bx) / dd * m; d.by += (ty - d.by) / dd * m; d.face = tx >= d.bx ? 1 : -1; d.mv = 0.15; }
        d.out = 0;
      } else if (d.busy) { d.out = 0; }
      else if (dist > z.r - 6) {
        d.out += dt;
        const run = d.fighter ? 150 : 60, m = Math.min(dist, run * dt), mx = -dxz / dist * m, my = -dyz / dist * m;
        d.bx += mx; d.by += my; if (Math.abs(mx) > 0.01) d.face = mx >= 0 ? 1 : -1; d.mv = 0.15;
        if (d.out > d.grace * (d.fighter ? 2.3 : 1) && !d.doomed) { removeFrom(fightersAlive, d); removeFrom(tokensAlive, d); killDot(d, null, "zone"); }
      } else d.out = Math.max(0, d.out - dt * 2);
    }
    // everybody who is left in the final: storm "orbital" finish (only the three heroes stay)
    if (st >= T.S[2][1] - 0.2) for (const d of fightersAlive.slice()) if (!d.busy) killDot(d, null, "zone");
    if (st >= T.S[2][1] - 0.2) for (const d of tokensAlive.slice()) killDot(d, null, "zone");

    // fights (fighters)
    if (st >= T.LAND + 0.4 && st < T.S[2][1] - 0.6) {
      const aliveF = fightersAlive.length, tgtF = curve(targets.f, st);
      for (; featureI < features.length && st >= features[featureI].t; featureI++) {
        const f0 = features[featureI], hero = f0.who;
        if (!hero.alive || hero.busy) continue;
        const v = nearestFighter(hero.bx, hero.by, (d) => !d.busy && !d.doomed && d.role === 0 && d.air !== true, 1200);
        if (v) startFight(hero, v, { hero: true, n: 5, spd: 250, R: 200 });
      }
      if (aliveF - fights.filter((f) => !f.nonlethal).length > tgtF && st - lastFight > 0.36 && fights.length < 6) { lastFight = st; pickFight(z); }
      // tokens
      const tgtT = curve(targets.t, st);
      tokQuota += Math.max(0, tokensAlive.length - tgtT) * Math.min(1, dt * 1.6) ;
      let q = Math.floor(tokQuota); tokQuota -= q;
      while (q-- > 0 && tokensAlive.length) {
        let best = null, bs = -1e9;
        for (let k = 0; k < 6; k++) { const c = tokensAlive[(Math.random() * tokensAlive.length) | 0]; const sc = Math.hypot(c.bx - z.x, c.by - z.y) - z.r + c.out * 60; if (sc > bs) { bs = sc; best = c; } }
        if (best) snipeToken(best, z);
      }
    }
    while (scriptI < script.length && st >= script[scriptI].t) script[scriptI++].f();
    if (winAt && st >= winAt && phase === "roll") { winAt = 0; showWin(); }
    // landing dust + sounds
    const alivePool = fightersAlive.length + tokensAlive.length + fin.filter((f) => f.alive).length;
    if (alivePool !== hudAlive) { hudAlive = alivePool; el.n.textContent = alivePool; }
    return z;
  }

  // ----- camera -----
  // Final arena: the island fades away, the arena alone sits in the middle of the screen (0 → 1).
  const AR_FROM = T.F - 1.8, AR_LEN = 1.6;
  function arenaU() { return phase === "win" ? 1 : phase === "roll" ? smooth(clamp((st - AR_FROM) / AR_LEN, 0, 1)) : 0; }
  function arenaScale() { const ah = IM.arena ? 360 * IM.arena.height / IM.arena.width : 300; return Math.min(1180 / 360, (H * 0.74) / ah); }
  function camTarget(z) {
    if (phase === "win") return { x: winnerDot.x, y: winnerDot.y, s: 2.6 };
    if (phase !== "roll") return { x: W / 2, y: H / 2, s: 1 };
    let s = clamp(520 / z.r, 1, 2.5), x = z.x, y = z.y;
    if (st >= T.F) {
      const al = fin.filter((f) => f.alive);
      x = zones[3].x; y = zones[3].y; if (al.length) { x = lerp(x, al.reduce((a, f) => a + f.x, 0) / al.length, 0.4); y = lerp(y, al.reduce((a, f) => a + f.y, 0) / al.length, 0.4); }
      s = 2.6;
    }
    const ar = arenaU();
    if (ar > 0) return { x: lerp(x, zones[3].x, ar), y: lerp(y, zones[3].y, ar), s: lerp(s, arenaScale(), ar) };
    const wgt = clamp((s - 1) / 0.8, 0, 1);
    return { x: lerp(W / 2, x, wgt), y: lerp(H / 2, y, wgt), s };
  }

  // ----- render helpers -----
  function drawFighter(d, a, yo, chute) {
    const s = sizeOf(d), x = d.x, y = d.y + yo;
    let row = d.col; if (phase === "win" && d === winnerDot) row = 3;
    let fr = 0;
    if (d.shoot > 0) fr = 3; else if (d.mv > 0 || chute) fr = chute ? 0 : 1 + (((now * 8 + d.ph) | 0) & 1);
    const bob = chute ? 0 : Math.abs(Math.sin(now * 7 + d.ph)) * (d.mv > 0 ? 3 : 0);
    g.globalAlpha = a;
    // ground shadow
    g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(x, d.y + 2, s * 0.26, s * 0.08, 0, 0, 6.283); g.fill();
    const sw = d.hurt > 0 ? (Math.random() - 0.5) * 3 : 0;
    g.save(); g.translate(x + sw, y - bob); if (d.face < 0) g.scale(-1, 1);
    g.drawImage(IM.fighters, fr * 192, row * 192, 192, 192, -s * 0.46, -s * 0.97, s, s);
    if (d.hurt > 0 && ((now * 30) | 0) % 2 === 0) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.4; g.drawImage(IM.fighters, fr * 192, row * 192, 192, 192, -s * 0.46, -s * 0.97, s, s); g.globalCompositeOperation = "source-over"; }
    g.restore(); g.globalAlpha = 1;
    if (chute) aspr(g, "chute", x, y - s * 0.55, s / 130);
  }
  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000); last = t; now += dt;
    if (mapDirty && IM.terrain) bakeMap();
    let z = null;
    if (phase === "roll") z = stepRoll(dt);
    else if (phase === "idle") radarA = (radarA + dt * 0.55) % 6.283;
    stepFights(dt); stepBullets(dt);
    bq.tick(); sq.tick();
    for (let i = tokensDead.length - 1; i >= 0; i--) if (!tokensDead[i].alive) tokensDead.splice(i, 1);

    // dot motion
    const idle = phase === "idle";
    for (const d of dots) {
      if (d.won) { d.x = d.hx; d.y = d.hy; continue; }
      if (d.hurt > 0) { d.hurt -= dt; d.bx += d.kvx * dt; d.by += d.kvy * dt; d.kvx *= 0.9; d.kvy *= 0.9; }
      if (d.shoot > 0) d.shoot -= dt;
      if (d.mv > 0) d.mv -= dt;
      if (idle && d.fighter && d.alive && !d.air) {
        // slow patrols near home
        if (now > d.wander) { d.wander = now + 2.5 + Math.random() * 5; d.tx = d.hx + (Math.random() - 0.5) * 120; d.ty = d.hy + (Math.random() - 0.5) * 70; if (!isLand(d.tx, d.ty)) { d.tx = d.hx; d.ty = d.hy; } }
        const dx = d.tx - d.bx, dy = d.ty - d.by, dd = Math.hypot(dx, dy);
        if (dd > 2) { const m = Math.min(dd, 26 * dt); d.bx += dx / dd * m; d.by += dy / dd * m; d.face = dx >= 0 ? 1 : -1; d.mv = 0.15; }
      }
      if (d.fighter) { d.x = d.bx; d.y = d.by; }
      else { const amp = idle ? 4 : 2; d.x = d.bx + Math.sin(now * 0.7 * d.sp + d.ph) * amp; d.y = d.by + Math.cos(now * 0.55 * d.sp + d.ph * 1.3) * amp * 0.8; }
    }
    // camera
    const ct = camTarget(z || { x: W / 2, y: H / 2, r: 1250 });
    const k = 1 - Math.exp(-dt * (phase === "win" ? 2.2 : 2.6));
    cam.x = lerp(cam.x, ct.x, k); cam.y = lerp(cam.y, ct.y, k); cam.s = lerp(cam.s, ct.s, k);
    const hw = W / (2 * cam.s), hh = H / (2 * cam.s);
    const AR = arenaU(), ka = 1 - AR; // with the map gone the camera may leave the island's bounds
    const cx = lerp(clamp(cam.x, hw, W - hw), cam.x, AR), cy = lerp(clamp(cam.y, hh, H - hh), cam.y, AR);
    shake = Math.max(0, shake - dt * 36);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0e0e10"; g.fillRect(0, 0, canvas.width, canvas.height);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    const S = bk * cam.s;
    g.setTransform(S, 0, 0, S, (-cx * cam.s + W / 2 + sx) * bk, (-cy * cam.s + H / 2 + sy) * bk);
    g.imageSmoothingEnabled = cam.s < 1.05;
    if (ka > 0.01) {
    g.globalAlpha = ka;
    if (map) { g.drawImage(map, 0, 0); g.drawImage(corpse, 0, 0); } else { g.fillStyle = "#14101e"; g.fillRect(0, 0, W, H); }
    g.globalAlpha = 1;

    // water glints, swamp bubbles, torch flames, manor glow
    for (const s of shore) { const a = 0.5 + 0.5 * Math.sin(now * s.sp + s.ph); if (a < 0.55) continue; g.fillStyle = `rgba(150,170,195,${(a - 0.5) * 0.8 * ka})`; g.fillRect(s.x, s.y, s.s, s.s); g.fillRect(s.x - s.s, s.y + 1, s.s * 3, 1); }
    g.globalCompositeOperation = "lighter";
    for (const b of bubbles) { const u = ((now + b.ph) % b.per) / b.per; g.strokeStyle = `rgba(150,255,110,${0.5 * (1 - u)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(b.x, b.y - u * 14, 1 + u * 5, 0, 6.283); g.stroke(); }
    for (let i = 0; i < TORCHES.length; i++) { const [x, y] = TORCHES[i], f = 0.8 + 0.2 * Math.sin(now * 11 + i * 2.1) + 0.1 * Math.sin(now * 23 + i); g.globalAlpha = 0.55 * f * ka; g.drawImage(flameStamp, x - 40 * f, y - 98 - 40 * f, 80 * f, 80 * f); }
    { const m = POIS[2]; g.globalAlpha = (0.05 + 0.02 * Math.sin(now * 2.3)) * ka; g.drawImage(flameStamp, m.x - 160, m.y - 30, 320, 240); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    // fog (under characters)
    g.globalAlpha = ka;
    for (let i = 0; i < 2; i++) { const ox = ((now * (6 + i * 5) * (i ? -1 : 1)) % W + W) % W; g.drawImage(fogLayers[i], ox, 0, W, H); g.drawImage(fogLayers[i], ox - W, 0, W, H); }
    g.globalAlpha = 1;
    }

    // radar
    if (idle) {
      if (g.createConicGradient) {
        const cgr = g.createConicGradient(radarA - 0.5, W / 2, H / 2);
        cgr.addColorStop(0, "rgba(200,210,225,0)"); cgr.addColorStop(0.08, "rgba(200,210,225,0.05)"); cgr.addColorStop(0.0805, "rgba(200,210,225,0)");
        g.fillStyle = cgr; g.beginPath(); g.arc(W / 2, H / 2, 1300, 0, 6.283); g.fill();
      }
      g.strokeStyle = "rgba(255,102,0,0.22)"; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(W / 2 + Math.cos(radarA) * 1300, H / 2 + Math.sin(radarA) * 1300); g.stroke();
    }

    // final arena
    if (AR > 0 && zones[3]) {
      const az = zones[3], gr = g.createRadialGradient(az.x, az.y, 20, az.x, az.y, 330);
      gr.addColorStop(0, `rgba(255,102,0,${0.16 * AR})`); gr.addColorStop(0.55, `rgba(120,70,40,${0.07 * AR})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(az.x - 340, az.y - 340, 680, 680);
    }
    if (phase !== "idle" && zones[3] && IM.arena && (st > T.S[2][0] - 0.5 || phase === "win")) {
      const u = phase === "win" ? 1 : clamp((st - (T.S[2][0] - 0.5)) / 2.2, 0, 1), az = zones[3], aw = 360 * u, ah = aw * (IM.arena.height / IM.arena.width);
      g.globalAlpha = u; g.drawImage(IM.arena, az.x - aw / 2, az.y - ah * 0.52, aw, ah); g.globalAlpha = 1;
    }

    // tokens (many)
    const pct = clamp(150 / Math.max(1, N), 0.05, 1);
    const showGlow = N <= 160;
    const tokenDraw = [];
    for (const d of dots) {
      if ((!d.alive && !d.won) || d.fighter) continue;
      if (d.spawn > now) continue;
      const age = now - d.spawn; let yo = 0, a = 1, sc = 1;
      if (d.spawn && age < d.dur) { const u = age / d.dur, e = 1 - (1 - u) * (1 - u); yo = -(1 - e) * 240; sc = 1 + (1 - e) * 0.9; a = Math.min(1, u * 3); }
      const sz = tokSize(d) * sc, name = d.won ? "tok3" : "tok" + d.col, outside = d.out > 0.05;
      if (showGlow || d.tier >= 2) { g.globalCompositeOperation = "lighter"; g.globalAlpha = (d.won ? 0.5 : 0.6) * a; const gs = sz * (d.tier >= 2 ? 2.2 : 1.8); g.drawImage(stamps[outside ? 3 : d.won ? 4 : d.col], d.x - gs / 2, d.y + yo - gs / 2, gs, gs); g.globalCompositeOperation = "source-over"; }
      g.globalAlpha = (d.won ? 0.9 : a) * ka;
      const at = AT && AT[name];
      if (at) { const k2 = sz / at[3]; g.drawImage(IM.atlas, at[0], at[1], at[2], at[3], d.x - at[2] * k2 / 2, d.y + yo - sz / 2 - sz * 0.06, at[2] * k2, sz); }
      else { g.fillStyle = COLORS[d.col]; g.fillRect(d.x - 3, d.y - 3, 6, 6); }
      if (idle && !d.won && (!d.lbl || d.lbl < now)) {
        let df = radarA - Math.atan2(d.y - H / 2, d.x - W / 2); df = ((df % 6.283) + 6.283) % 6.283;
        if (df < 0.07 && Math.random() < pct) d.lbl = now + 2.6;
      }
      tokenDraw.push(d);
    }
    g.globalAlpha = 1;
    // fighters sorted by y
    const fighters = [];
    for (const d of dots) if (d.fighter && (d.alive || d.won) && d.spawn <= now && !(d.role === 1 && phase === "win" && false)) fighters.push(d);
    fighters.sort((a, b) => a.y - b.y);
    if (IM.fighters) for (const d of fighters) {
      const age = now - d.spawn; let yo = 0, a = 1, chute = false;
      if (d.spawn && age < d.dur) { const u = clamp(age / d.dur, 0, 1), e = d.air ? 1 - Math.pow(1 - u, 2) : 1 - (1 - u) * (1 - u); yo = -(1 - e) * (d.air ? 640 : 240); a = Math.min(1, u * 4); chute = d.air && u < 0.97; if (chute) yo += Math.sin(now * 4 + d.ph) * 4; }
      else if (d.air) { d.air = false; fx("hit", d.x, d.y, 0.45, false, 0, 20); burst(d.x, d.y, "#8a7a5a", 5, 60, 2); }

      const outside = d.out > 0.05;
      g.globalCompositeOperation = "lighter"; g.globalAlpha = (d.tier >= 2 ? 0.55 : 0.3) * a; const gs = sizeOf(d) * 1.3; g.drawImage(stamps[outside ? 3 : d.role === 1 && phase === "win" ? 4 : d.col], d.x - gs / 2, d.y - gs * 0.35 + yo, gs, gs * 0.7); g.globalCompositeOperation = "source-over";
      drawFighter(d, a, yo, chute);
    }
    g.globalAlpha = 1;

    // storm
    if (z && ka > 0.01) {
      if (!stormPat && IM.storm) stormPat = g.createPattern(IM.storm, "repeat");
      g.save();
      g.beginPath(); g.rect(-3000, -3000, 8000, 8000); g.arc(z.x, z.y, z.r, 0, 6.283); g.clip("evenodd");
      g.fillStyle = `rgba(6,8,14,${0.5 * ka})`; g.fillRect(-3000, -3000, 8000, 8000);
      if (stormPat) {
        for (let i = 0; i < 2; i++) {
          stormPat.setTransform?.(new DOMMatrix().translate(now * (i ? -26 : 34), now * (i ? 18 : -12)).scale(i ? 0.55 : 0.8));
          g.globalAlpha = (i ? 0.16 : 0.3) * ka; g.globalCompositeOperation = "source-over"; g.fillStyle = stormPat; g.fillRect(-3000, -3000, 8000, 8000);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
      g.restore();
      // storm wall: bright textured band along the edge
      if (stormPat) {
        g.save(); g.beginPath(); g.arc(z.x, z.y, z.r + 26, 0, 6.283); g.arc(z.x, z.y, z.r - 4, 0, 6.283); g.clip("evenodd");
        stormPat.setTransform?.(new DOMMatrix().translate(now * 60, -now * 30).scale(0.5)); g.globalCompositeOperation = "lighter"; g.globalAlpha = (z.shrink ? 0.5 : 0.32) * ka; g.fillStyle = stormPat; g.fillRect(z.x - z.r - 40, z.y - z.r - 40, z.r * 2 + 80, z.r * 2 + 80); g.restore();
      }
      g.globalAlpha = ka; g.lineWidth = 3 / cam.s + 1; g.strokeStyle = z.shrink ? "#d8452e" : "#c8641e"; g.shadowColor = z.shrink ? "#d8452e" : "#ff6600"; g.shadowBlur = 5;
      g.beginPath(); g.arc(z.x, z.y, z.r, 0, 6.283); g.stroke(); g.shadowBlur = 0; g.globalAlpha = 1;
      if (false) { // lightning bolts on the wall
        const a0 = Math.random() * 6.283; g.strokeStyle = "rgba(230,210,255,0.95)"; g.lineWidth = 2.5 / cam.s + 0.8; g.beginPath();
        let a = a0, rr = z.r + 36; g.moveTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr);
        for (let i = 0; i < 7; i++) { a += (Math.random() - 0.5) * 0.04; rr -= 8 + Math.random() * 14; g.lineTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); }
        g.stroke();
      }
      if (z.next) {
        g.lineWidth = 3 / cam.s + 0.5; g.strokeStyle = "rgba(255,255,255,0.4)"; g.setLineDash([14 / cam.s + 4, 10 / cam.s + 4]); g.lineDashOffset = -now * 18;
        g.beginPath(); g.arc(z.next.x, z.next.y, z.next.r, 0, 6.283); g.stroke(); g.setLineDash([]);
      }
    }

    // bats
    if (AT) for (const b of bats) { const a = now * b.sp + b.ph, x = b.cx + Math.cos(a) * b.rx, y = b.cy + Math.sin(a) * b.ry, fr = ((now * 9 + b.fp) | 0) % 6; g.globalAlpha = 0.95 * ka; aspr(g, "bat" + fr, x, y, 0.8, Math.cos(a) * b.sp > 0); }
    g.globalAlpha = 1;

    // bullets and fx
    for (const b of bullets) {
      // keep tracers the same size on screen: the arena close-up zooms ~3x and they turned into rockets
      const bz = Math.min(1, 1.25 / cam.s), gw = 18 * bz;
      aspr(g, b.kind, b.x, b.y, (b.big ? 0.8 : 0.55) * bz, false, b.ang);
      g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.35; g.drawImage(flameStamp, b.x - gw / 2, b.y - gw / 2, gw, gw); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i]; f.t += dt; const n = f.kind === "poof" ? 6 : f.kind === "hit" ? 6 : 6, idx = Math.floor(f.t * (f.kind === "poof" ? 8 : f.fps));
      if (idx >= n) { fxs.splice(i, 1); continue; }
      const add = f.kind !== "poof"; if (add) g.globalCompositeOperation = "lighter";
      if (f.kind === "poof") g.globalAlpha = idx > 3 ? 0.8 : 1;
      aspr(g, f.kind + idx, f.x, f.kind === "poof" ? f.y - idx * 3 * f.sc : f.y, f.sc * (f.kind === "poof" ? 0.8 : 1), f.flip, f.rot);
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy = p.vy * 0.95 + 60 * dt;
      g.globalAlpha = Math.min(1, p.life * 2.5); g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.sz), Math.ceil(p.sz));
    }
    g.globalAlpha = 1;

    // names
    labelRects.length = 0;
    g.textBaseline = "alphabetic";
    const hotIds = new Set();
    if (phase === "roll" && st >= T.S[1][1] - 1) for (const d of fin) if (d.alive) hotIds.add(d);
    for (const d of fin) {
      if (!d.alive || phase === "idle") continue;
      if (phase === "roll" && st < T.S[1][1] - 1) continue;
      if (phase === "win") continue;
      const s = cam.s, yy = d.y - sizeOf(d) * 1.0 - 4 / s;
      if (st >= T.F - 0.8) {
        const w = 74 / s, h = 8 / s, x0 = d.x - w / 2, y0 = yy + 4 / s;
        g.fillStyle = "#000000cc"; g.fillRect(x0 - 2 / s, y0 - 2 / s, w + 4 / s, h + 4 / s);
        g.fillStyle = d.hp < 0.3 ? "#d8452e" : "#e8e4dc"; g.fillRect(x0, y0, w * d.hp, h);
      }
      drawLabel(d, d.x, yy - 6 / s - 8 / s, s, true);
    }
    // sprite names: the top ticket holders always, tokens on the radar sweep
    if (phase === "idle" || (phase === "roll" && st < T.S[2][0])) {
      let drawn = 0; const s = cam.s;
      for (const d of fighters) {
        if (hotIds.has(d) || d.air && now < d.spawn + d.dur) continue;
        if (drawn > 70) break;
        if (d.role > 0 && phase === "roll" && st >= T.S[1][1] - 1) continue;
        if (N > 40 && drawn > 36 && d.tier < 2) continue;
        if (drawLabel(d, d.x, d.y - sizeOf(d) * 1.0 - 2 / s, s, false)) drawn++;
      }
      if (idle) for (const d of tokenDraw) { if (d.lbl > now && drawn < 90) { g.globalAlpha = Math.min(1, (d.lbl - now) * 2); if (drawLabel(d, d.x, d.y - tokSize(d) * 0.7, s, false)) drawn++; g.globalAlpha = 1; } else if (d.won) drawLabel(d, d.x, d.y - tokSize(d) * 0.7, s, false); }
    }

    // screen-space overlays
    g.setTransform(bk, 0, 0, bk, 0, 0);
    if (phase === "roll" && z && z.shrink && !ctx.reducedMotion) {
      const gr = g.createRadialGradient(W / 2, H / 2, 420, W / 2, H / 2, 1150);
      gr.addColorStop(0, "rgba(216,69,46,0)"); gr.addColorStop(1, `rgba(216,69,46,${0.07 + 0.03 * Math.sin(now * 8)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    } else {
      const gr = g.createRadialGradient(W / 2, H / 2, 460, W / 2, H / 2, 1200);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.55)");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.y += c.vy * dt; c.x += c.vx * dt + Math.sin(now * 3 + c.rot) * 0.6; c.rot += dt * 3;
      if (c.y > H + 20) { if (phase === "win") { c.y = -20; } else { confetti.splice(i, 1); continue; } }
      g.fillStyle = c.c; g.fillRect(Math.round(c.x), Math.round(c.y), c.s, c.s);
    }
    if (idle) hudAlive = N;
    el.zone.classList.toggle("hot", phase === "roll" && !!z && z.shrink);
  }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });

  const onVis = () => { last = performance.now(); };
  document.addEventListener("visibilitychange", onVis);
  setTimeout(() => { if (phase === "idle") say("Шукай себе на карті, чат!", 4.5, 1); }, 1200);
  void bornAt; void assetsP;

  return {
    setParticipants,
    roll,
    reset,
    setPrize,
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVis);
      link.remove(); root.innerHTML = ""; root.classList.remove("wr-root");
    },
  };
}
