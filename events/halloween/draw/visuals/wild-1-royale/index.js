// «Гарбузовий Рояль»: участники это точки на карте, зона шторма сжимается вокруг заранее заданного
// победителя, остальные выбывают, финал это дуэль трёх. Визуал только показывает.
export const meta = { id: "wild-1-royale", title: "Гарбузовий Рояль", author: "agent" };

const W = 1920, H = 1080, PX = 4, GW = W / PX, GH = H / PX;
const T = { S1a: 1.4, S1b: 4.4, S2a: 4.8, S2b: 7.2, S3a: 7.6, S3b: 9.6 };
const COLORS = ["#ff6600", "#7cff4f", "#a66bff", "#ff3030", "#ffd24a"]; // pumpkins, orders, both, storm, gold
const CSS_URL = new URL("./style.css", import.meta.url).href;
const SPR = (n) => new URL(`../../assets/sprites/${n}.png`, import.meta.url).href;

// ---------- small helpers ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (u) => u * u * (3 - 2 * u);
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => { let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const u = smooth(xf), v = smooth(yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
function fbm(x, y, seed) { return vnoise(x, y, seed) * 0.5 + vnoise(x * 2, y * 2, seed + 1) * 0.28 + vnoise(x * 4, y * 4, seed + 2) * 0.15 + vnoise(x * 8, y * 8, seed + 3) * 0.07; }
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// ---------- procedural map ----------
const POIS = [
  { n: "Гарбузове поле", x: 0.27, y: 0.36, t: "field" },
  { n: "Цвинтар", x: 0.72, y: 0.27, t: "yard" },
  { n: "Маєток", x: 0.5, y: 0.5, t: "manor" },
  { n: "Болото", x: 0.24, y: 0.72, t: "swamp" },
  { n: "Магазин ChiSetup", x: 0.76, y: 0.7, t: "shop" },
  { n: "Хатина відьми", x: 0.47, y: 0.22, t: "hut" },
];

function makeMap() {
  const land = new Uint8Array(GW * GH);
  const small = document.createElement("canvas");
  small.width = GW; small.height = GH;
  const sg = small.getContext("2d");
  const img = sg.createImageData(GW, GH);
  const pal = {
    deep: hex("#120a24"), shallow: hex("#1e1240"), shore: hex("#2b2236"),
    swampA: hex("#16281f"), swampB: hex("#1b3326"), groundA: hex("#1b1f1a"), groundB: hex("#232a21"),
    pumpA: hex("#2c1a10"), pumpB: hex("#3a2312"), hill: hex("#2d2a38"),
  };
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const nx = x / GW, ny = y / GH;
    const dx = (nx - 0.5) * 2 / 1.02, dy = (ny - 0.5) * 2 / 1.06;
    const d = Math.sqrt(dx * dx + dy * dy);
    let h = fbm(nx * 4.2, ny * 2.9, 11) + 0.36 - 0.68 * Math.pow(d, 2.2);
    const lake = fbm(nx * 5.5 + 9, ny * 3.6 + 4, 29);
    if (lake > 0.64 && d < 0.78) h = Math.min(h, 0.33 + (0.64 - lake) * 0.4);
    const b = fbm(nx * 3.1 + 3, ny * 2.2 + 7, 53);
    const dither = ((x * 7 + y * 13) % 5 === 0) || vnoise(x * 0.9, y * 0.9, 5) > 0.72;
    let c;
    if (h < 0.3) c = pal.deep;
    else if (h < 0.42) c = pal.shallow;
    else if (h < 0.455) { c = pal.shore; land[y * GW + x] = 1; }
    else {
      land[y * GW + x] = 1;
      if (h > 0.86) c = pal.hill;
      else if (b < 0.4) c = dither ? pal.swampB : pal.swampA;
      else if (b > 0.6) c = dither ? pal.pumpB : pal.pumpA;
      else c = dither ? pal.groundB : pal.groundA;
    }
    const i = (y * GW + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  sg.putImageData(img, 0, 0);

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, W, H);
  const isLand = (x, y) => x >= 0 && y >= 0 && x < W && y < H && land[((y / PX) | 0) * GW + ((x / PX) | 0)] === 1;
  const r = rng(77);

  // poi placement: nudge to land
  const pois = [];
  for (const p of POIS) {
    let px = p.x * W, py = p.y * H, ok = isLand(px, py);
    for (let k = 1; !ok && k < 60; k++) for (let a = 0; a < 12 && !ok; a++) {
      const qx = p.x * W + Math.cos(a * 0.5236) * k * 14, qy = p.y * H + Math.sin(a * 0.5236) * k * 14;
      if (isLand(qx, qy) && isLand(qx + 60, qy) && isLand(qx - 60, qy) && isLand(qx, qy + 40)) { px = qx; py = qy; ok = true; }
    }
    if (ok) pois.push({ ...p, px, py });
  }
  const nearPoi = (x, y, rr) => pois.some((p) => Math.hypot(p.px - x, p.py - y) < rr);

  // roads
  g.strokeStyle = "#3a3122"; g.lineWidth = 6; g.setLineDash([12, 8]); g.globalAlpha = 0.75;
  for (let i = 0; i < pois.length; i++) {
    const a = pois[i], b = pois[(i + 2) % pois.length];
    g.beginPath(); g.moveTo(a.px, a.py);
    g.quadraticCurveTo((a.px + b.px) / 2 + (r() - 0.5) * 120, (a.py + b.py) / 2 + (r() - 0.5) * 120, b.px, b.py);
    g.stroke();
  }
  g.setLineDash([]); g.globalAlpha = 1;

  // trees
  for (let i = 0; i < 420; i++) {
    const x = r() * W, y = r() * H;
    if (!isLand(x, y) || nearPoi(x, y, 90)) continue;
    const s = 8 + r() * 8;
    g.fillStyle = "#0a160f"; g.fillRect(x - 2, y, 4, s * 0.5);
    g.fillStyle = r() < 0.5 ? "#0f2418" : "#12301f";
    for (let k = 0; k < 3; k++) g.fillRect(x - s * (0.8 - k * 0.22), y - k * s * 0.45, s * (1.6 - k * 0.44), s * 0.5);
  }
  for (const p of pois) {
    const { px: x, py: y } = p;
    if (p.t === "field") for (let i = 0; i < 70; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 120, qx = x + Math.cos(a) * d * 1.3, qy = y + Math.sin(a) * d * 0.9;
      if (!isLand(qx, qy)) continue;
      g.fillStyle = "#3d7a1f"; g.fillRect(qx - 1, qy - 7, 3, 4);
      g.fillStyle = r() < 0.5 ? "#ff6600" : "#e55a00"; g.fillRect(qx - 5, qy - 4, 10, 8); g.fillStyle = "#ffa44d"; g.fillRect(qx - 3, qy - 3, 3, 3);
    }
    if (p.t === "yard") {
      g.strokeStyle = "#4a4458"; g.lineWidth = 4; g.strokeRect(x - 120, y - 70, 240, 140);
      for (let i = 0; i < 38; i++) {
        const qx = x - 105 + r() * 210, qy = y - 55 + r() * 110;
        g.fillStyle = "#6b6678"; g.fillRect(qx - 5, qy - 8, 10, 12); g.fillRect(qx - 3, qy - 11, 6, 3);
        g.fillStyle = "#2a2733"; g.fillRect(qx - 2, qy - 5, 4, 2);
      }
    }
    if (p.t === "manor") {
      g.fillStyle = "#1a1228"; g.fillRect(x - 55, y - 32, 110, 64);
      g.fillStyle = "#2b1c44"; g.beginPath(); g.moveTo(x - 66, y - 30); g.lineTo(x, y - 74); g.lineTo(x + 66, y - 30); g.fill();
      g.fillStyle = "#ffb347"; for (const wx of [-36, -8, 20]) g.fillRect(x + wx, y - 18, 14, 18);
      g.fillStyle = "#0a0612"; g.fillRect(x - 6, y + 4, 12, 28);
    }
    if (p.t === "swamp") for (let i = 0; i < 9; i++) {
      const qx = x + (r() - 0.5) * 200, qy = y + (r() - 0.5) * 120;
      g.fillStyle = "#1d4a2e"; g.fillRect(qx - 20, qy - 8, 40, 16); g.fillStyle = "#2d7a46"; g.fillRect(qx - 10, qy - 4, 14, 6);
    }
    if (p.t === "shop") {
      g.fillStyle = "#1c1c22"; g.fillRect(x - 56, y - 30, 112, 60);
      g.fillStyle = "#ff6600"; for (let i = 0; i < 7; i++) g.fillRect(x - 60 + i * 17, y - 38, 9, 14);
      g.fillStyle = "#7cff4f"; g.fillRect(x - 48, y - 10, 96, 6);
      g.fillStyle = "#ffb347"; g.fillRect(x - 40, y + 4, 22, 26); g.fillRect(x + 14, y + 4, 26, 18);
    }
    if (p.t === "hut") {
      g.fillStyle = "#2a1a14"; g.fillRect(x - 24, y - 14, 48, 32);
      g.fillStyle = "#0e0a14"; g.beginPath(); g.moveTo(x - 34, y - 12); g.lineTo(x, y - 52); g.lineTo(x + 34, y - 12); g.fill();
      g.fillStyle = "#7cff4f"; g.fillRect(x - 6, y - 4, 12, 14);
    }
  }
  // tactical grid + labels
  g.lineWidth = 1; g.strokeStyle = "#ffffff0d";
  for (let i = 1; i < 16; i++) { g.beginPath(); g.moveTo(i * 120, 0); g.lineTo(i * 120, H); g.stroke(); }
  for (let j = 1; j < 9; j++) { g.beginPath(); g.moveTo(0, j * 120); g.lineTo(W, j * 120); g.stroke(); }
  g.fillStyle = "#ffffff30"; g.font = '700 15px "Exo 2", sans-serif'; g.textAlign = "left"; g.textBaseline = "top";
  for (let i = 0; i < 16; i++) g.fillText(String.fromCharCode(65 + i), i * 120 + 6, 6);
  for (let j = 0; j < 9; j++) g.fillText(String(j + 1), 6, j * 120 + 6);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = '800 20px "Exo 2", sans-serif'; g.lineJoin = "round";
  for (const p of pois) {
    g.lineWidth = 5; g.strokeStyle = "#000000bb"; g.fillStyle = "#ffffffa0";
    g.strokeText(p.n.toUpperCase(), p.px, p.py + 62); g.fillText(p.n.toUpperCase(), p.px, p.py + 62);
  }
  return { cv, isLand, pois };
}

// ---------- mount ----------
export function mount(root, ctx) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = CSS_URL;
  document.head.append(link);

  root.classList.add("wr-root");
  root.innerHTML = `
    <div class="wr-stage">
      <canvas class="wr-c"></canvas>
      <div class="wr-hud">
        <div class="wr-title"><i>🎃</i> ГАРБУЗОВИЙ РОЯЛЬ <i>·</i> ChiSetup Halloween</div>
        <div class="wr-counter"><div class="wr-alive"><small class="wr-al">УЧАСНИКІВ</small><b class="wr-n">0</b></div><div class="wr-zone"><small class="wr-zk">РАУНД</small><span class="wr-zv">1 З 5</span></div></div>
        <div class="wr-feed"></div>
        <div class="wr-banner"></div>
        <div class="wr-bottom"><span class="wr-st"></span><span><em style="background:#ff6600"></em>гарбузи</span><span><em style="background:#7cff4f"></em>замовлення</span><span><em style="background:#a66bff"></em>обидва</span><span><em style="background:#ffd24a"></em>вже виграли</span></div>
        <div class="wr-bubble"></div>
        <div class="wr-cam"><b>MAX CAM</b><img alt="" src="${SPR("hero_blink")}"></div>
        <div class="wr-flash"></div>
        <div class="wr-win"><div class="wr-rays"></div><div class="wr-kicker"></div><div class="wr-emblem"></div><div class="wr-name"></div><div class="wr-sub"></div><img class="wr-hero" alt="" src="${SPR("hero_wave")}"></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const stage = $(".wr-stage"), canvas = $(".wr-c"), g = canvas.getContext("2d");
  const el = { n: $(".wr-n"), al: $(".wr-al"), zk: $(".wr-zk"), zv: $(".wr-zv"), zone: $(".wr-zone"), feed: $(".wr-feed"), banner: $(".wr-banner"), st: $(".wr-st"), bubble: $(".wr-bubble"), flash: $(".wr-flash"), win: $(".wr-win"), kicker: $(".wr-kicker"), emblem: $(".wr-emblem"), name: $(".wr-name"), sub: $(".wr-sub") };

  // ----- layout -----
  let fit = 1;
  function layout() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    fit = Math.min(w / W, h / H);
    stage.style.transform = `translate(${(w - W * fit) / 2}px, ${(h - H * fit) / 2}px) scale(${fit})`;
    const bs = clamp(fit * (devicePixelRatio || 1), 0.5, 1);
    const cw = Math.round(W * bs), ch = Math.round(H * bs);
    if (canvas.width !== cw) { canvas.width = cw; canvas.height = ch; }
    bk = bs;
  }
  let bk = 1;
  const onResize = () => layout();
  addEventListener("resize", onResize);
  layout();

  // ----- assets -----
  let map = makeMap();
  document.fonts?.load('800 20px "Exo 2"').then(() => document.fonts.load('700 20px "Exo 2"')).then(() => { if (alive) map = makeMap(); }).catch(() => {});
  const stamps = COLORS.map((c) => {
    const s = document.createElement("canvas"); s.width = s.height = 48;
    const x = s.getContext("2d"), [r, gg, b] = hex(c);
    const gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, `rgba(${r},${gg},${b},0.95)`); gr.addColorStop(0.2, `rgba(${r},${gg},${b},0.8)`);
    gr.addColorStop(0.42, `rgba(${r},${gg},${b},0.22)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 48, 48);
    x.fillStyle = "#fff"; x.beginPath(); x.arc(24, 24, 4.6, 0, 6.283); x.fill();
    return s;
  });
  const storm = (() => {
    const s = document.createElement("canvas"); s.width = s.height = 128;
    const x = s.getContext("2d"), im = x.createImageData(128, 128);
    for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
      const n = (vnoise(i / 14, j / 14, 3) + vnoise(i / 5, j / 5, 8) * 0.5) / 1.5;
      const k = (i + j * 0.0);
      const o = (j * 128 + i) * 4; const v = n > 0.55 ? 255 : 0;
      im.data[o] = 160; im.data[o + 1] = 80; im.data[o + 2] = 255; im.data[o + 3] = v ? 46 : 14; void k;
    }
    x.putImageData(im, 0, 0);
    return s;
  })();
  const stormPat = g.createPattern(storm, "repeat");
  const corpse = document.createElement("canvas"); corpse.width = W; corpse.height = H;
  const cg = corpse.getContext("2d");
  const heroImg = new Image(); heroImg.src = SPR("hero_wave");
  const avatars = new Map();
  function avatarOf(url) {
    if (!url || !ctx.privacy?.avatars) return null;
    let a = avatars.get(url);
    if (!a) { a = new Image(); a.src = url; a.onerror = () => { a.bad = true; }; avatars.set(url, a); }
    return a.complete && a.naturalWidth && !a.bad ? a : null;
  }

  // ----- state -----
  let alive = true, raf = 0, last = performance.now(), now = 0;
  let dots = [], byId = new Map(), won = new Set();
  let phase = "idle"; // idle | roll | win
  let N = 0, mult = 1;
  let st = 0, info = null, winnerDot = null, fin = [], aliveArr = [], zones = [], targets = null;
  let scriptI = 0, script = [], kills = 0, winnerKills = 0;
  let cam = { x: W / 2, y: H / 2, s: 1 }, shake = 0, lastFeed = 0, lastTick = 0, bubbleT = 0, lastBeat = -9;
  const particles = [], tracers = [], confetti = [], feedRows = [];
  const labelRects = [];
  let radarA = 0, hudAlive = -1, rollResolve = null, lastStage = -1, bannerT = 0;

  function mkDot(p, delay) {
    const rnd = rng(hash(p.id));
    let x = 0, y = 0;
    for (let k = 0; k < 40; k++) { x = 60 + rnd() * (W - 120); y = 60 + rnd() * (H - 120); if (map.isLand(x, y)) break; }
    return { p, id: p.id, bx: x, by: y, x, y, ph: rnd() * 6.283, sp: 0.5 + rnd(), alive: true, spawn: now + delay, out: 0, grace: 0.3 + rnd() * 1.3, lbl: 0, role: 0, hp: 1, r: 4, col: 0, won: false, slot: 0 };
  }
  function style(d) {
    const p = d.p;
    d.col = p.via?.includes("pumpkins") && p.via.includes("orders") ? 2 : p.via?.includes("orders") ? 1 : 0;
    d.r = clamp(3 + 1.5 * Math.sqrt(Math.max(1, p.tickets || 1)), 4, 11) * mult;
  }
  function recount() {
    const pool = dots.filter((d) => !d.won).length;
    N = pool;
    mult = N <= 20 ? 3.8 : Math.max(1, 1 + 2.2 * (1 - Math.log(N / 20) / Math.log(100)));
    for (const d of dots) style(d);
  }

  function setParticipants(list) {
    const seen = new Set();
    won = new Set(list.filter((p) => p.won).map((p) => p.id));
    let i = 0;
    for (const p of list) {
      seen.add(p.id);
      let d = byId.get(p.id);
      if (!d) { d = mkDot(p, phase === "idle" ? (dots.length < 1 ? 0 : Math.random() * 1.1) : 0); byId.set(p.id, d); dots.push(d); }
      d.p = p; d.won = won.has(p.id); i++;
      if (d.won) d.alive = false; else if (phase === "idle" && !d.alive) d.alive = true;
    }
    dots = dots.filter((d) => { if (seen.has(d.id)) return true; byId.delete(d.id); return false; });
    recount();
    if (phase === "idle") hudIdle();
  }

  // ----- hud -----
  function hudIdle() {
    el.al.textContent = "УЧАСНИКІВ"; el.n.textContent = N;
    el.zk.textContent = "ЕФІР"; el.zv.textContent = "РОЗІГРАШ";
    const tix = dots.reduce((s, d) => s + (d.won ? 0 : d.p.tickets || 0), 0);
    el.st.textContent = `Учасники: ${N} · Квитки: ${tix}`;
  }
  function banner(text, cls = "", ms = 1500) {
    el.banner.textContent = text; el.banner.className = "wr-banner on " + cls;
    clearTimeout(bannerT); bannerT = setTimeout(() => el.banner.classList.remove("on"), ms);
  }
  function say(text, ms = 2200) {
    el.bubble.textContent = text; el.bubble.classList.add("on");
    clearTimeout(bubbleT); bubbleT = setTimeout(() => el.bubble.classList.remove("on"), ms);
  }
  function flash(cls = "") {
    if (ctx.reducedMotion) return;
    el.flash.className = "wr-flash " + cls; void el.flash.offsetWidth; el.flash.className = "wr-flash go " + cls;
  }
  function feed(a, b, cls, icon, important) {
    if (!important && now - lastFeed < 0.07) return;
    lastFeed = now;
    const row = document.createElement("div");
    row.className = "wr-kf " + cls;
    if (a) { const k = document.createElement("span"); k.className = "k"; k.textContent = a; row.append(k); }
    const i = document.createElement("i"); i.textContent = icon; row.append(i);
    const v = document.createElement("span"); v.className = "v"; v.textContent = b; row.append(v);
    el.feed.append(row);
    feedRows.push({ row, t: now });
    while (feedRows.length > 8) feedRows.shift().row.remove();
  }

  // ----- fx -----
  function burst(x, y, col, n = 7, spd = 90) {
    for (let i = 0; i < n && particles.length < 800; i++) {
      const a = Math.random() * 6.283, v = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.5 + Math.random() * 0.5, max: 1, col, sz: 2 + Math.random() * 2.5 });
    }
  }
  function mark(d) {
    cg.strokeStyle = "#ff3030"; cg.globalAlpha = 0.28; cg.lineWidth = 1.6;
    cg.beginPath(); cg.moveTo(d.x - 3, d.y - 3); cg.lineTo(d.x + 3, d.y + 3); cg.moveTo(d.x + 3, d.y - 3); cg.lineTo(d.x - 3, d.y + 3); cg.stroke(); cg.globalAlpha = 1;
  }
  function killDot(v, by, cause) {
    if (!v.alive) return;
    v.alive = false;
    const i = aliveArr.indexOf(v); if (i >= 0) { aliveArr[i] = aliveArr[aliveArr.length - 1]; aliveArr.pop(); }
    mark(v); burst(v.x, v.y, COLORS[v.col], N > 600 ? 3 : 8, 100);
    if (by && by !== v) { by.kills = (by.kills || 0) + 1; if (by === winnerDot) winnerKills++; }
    kills++;
    const hero = v.role > 0 || (by && by.role > 0);
    if (by && by !== v && (cause === "player" || cause === "duel")) {
      const dx = by.x - v.x, dy = by.y - v.y;
      if (tracers.length < 26 && (hero || dx * dx + dy * dy < 420 * 420)) tracers.push({ x1: by.x, y1: by.y, x2: v.x, y2: v.y, life: hero ? 0.5 : 0.22, hero });
      feed(by.p.name, v.p.name, hero ? "hero" : "", "🔫", hero);
    } else feed("", v.p.name, hero ? "hero" : "zone", "💀 у зоні:", hero);
    if (now - lastTick > 0.05) { lastTick = now; ctx.sound?.("tick"); }
  }

  // ----- roll -----
  function buildZones(w) {
    const rn = Math.random;
    const off = (r, k) => { const a = rn() * 6.283, d = rn() * k * r; return [w.x + Math.cos(a) * d, w.y + Math.sin(a) * d]; };
    const c1 = off(430, 0.55), c2 = off(190, 0.5), c3 = off(78, 0.3);
    return [{ x: W / 2, y: H / 2, r: 1250 }, { x: c1[0], y: c1[1], r: 430 }, { x: c2[0], y: c2[1], r: 190 }, { x: c3[0], y: c3[1], r: 78 }];
  }
  const ez = (u) => u * 0.55 + smooth(u) * 0.45;
  function zoneAt(t) {
    const segs = [[T.S1a, T.S1b], [T.S2a, T.S2b], [T.S3a, T.S3b]];
    for (let i = 0; i < 3; i++) {
      const [a, b] = segs[i];
      if (t < a) return { ...zones[i], next: zones[i + 1], shrink: false, stage: i + 1, wait: a - t };
      if (t < b) { const u = ez((t - a) / (b - a)), A = zones[i], B = zones[i + 1]; return { x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), r: lerp(A.r, B.r, u), next: B, shrink: true, stage: i + 1, wait: 0 }; }
    }
    return { ...zones[3], next: null, shrink: false, stage: 4, wait: 0 };
  }
  function targetAlive(t) {
    const pts = [[0, N], [T.S1a, N], [T.S1b, targets.a1], [T.S2b, targets.a2], [T.S3b, targets.F]];
    for (let i = 1; i < pts.length; i++) if (t < pts[i][0]) { const u = (t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return Math.round(lerp(pts[i - 1][1], pts[i][1], u)); }
    return targets.F;
  }

  function roll(winner, inf) {
    return new Promise((resolve) => {
      info = inf; rollResolve = resolve;
      let wd = byId.get(winner.id);
      if (!wd) { wd = mkDot(winner, 0); byId.set(winner.id, wd); dots.push(wd); }
      wd.p = winner; wd.won = false; wd.alive = true;
      for (const d of dots) if (!d.won) d.alive = true;
      recount();
      winnerDot = wd; kills = 0; winnerKills = 0;
      // decoys: two nearest alive dots
      const others = dots.filter((d) => d !== wd && !d.won).sort((a, b) => (a.bx - wd.bx) ** 2 + (a.by - wd.by) ** 2 - ((b.bx - wd.bx) ** 2 + (b.by - wd.by) ** 2));
      const decoys = others.slice(0, 2);
      fin = [wd, ...decoys];
      fin.forEach((d, i) => { d.role = i === 0 ? 1 : 2; d.hp = 1; d.slot = i; d.kills = 0; });
      for (const d of dots) { d.out = 0; d.kills = d === wd ? 0 : d.kills && 0; d.spawn = 0; }
      aliveArr = dots.filter((d) => !d.won && d.role === 0);
      zones = buildZones(wd);
      const F = fin.length;
      targets = { F, a1: Math.min(N, Math.max(F + 4, Math.round(N * 0.22))), a2: Math.min(N, Math.max(F + 1, Math.round(N * 0.04))) };
      targets.a2 = Math.min(targets.a2, targets.a1);
      // scripted duel (relative to S3b)
      script = [];
      const [d1, d2] = decoys;
      let tt = T.S3b + 0.9;
      if (F === 3) { script.push({ t: tt, f: () => { killDot(d2, d1, "duel"); banner("ЛИШИЛОСЬ 2", "red", 1400); ctx.sound?.("boom"); shake = 14; } }); tt += 1.1; }
      if (F >= 2) {
        script.push({ t: tt, f: () => { wd.hp = 0.08; hit(wd, d1); } }); tt += 1.3;
        script.push({ t: tt, f: () => { killDot(d1, wd, "duel"); shake = 22; flash("white"); ctx.sound?.("boom"); } }); tt += 0.9;
      }
      script.push({ t: tt, f: () => showWin() });
      scriptI = 0; st = 0; phase = "roll"; lastStage = -1; lastBeat = -9;
      el.win.classList.remove("on"); el.banner.classList.remove("on");
      el.al.textContent = "ЖИВИХ"; el.zk.textContent = `РАУНД ${info.round}/${info.totalRounds}`; el.zv.textContent = "ПРИЗЕМЛЕННЯ";
      el.st.textContent = `Квитки: ${info.totalTickets} · seed ${String(info.seedHash || "").slice(0, 8)}`;
      banner("ЗОНА ЗАКРИВАЄТЬСЯ", "red", 1700); say("ПОЇХАЛИ!!!", 1800);
      ctx.sound?.("drum"); ctx.sound?.("whoosh"); flash();
      shake = ctx.reducedMotion ? 0 : 8;
    });
  }
  function hit(v, by) {
    tracers.push({ x1: by.x, y1: by.y, x2: v.x, y2: v.y, life: 0.6, hero: true });
    burst(v.x, v.y, "#ff3030", 22, 160);
    feed(by.p.name, v.p.name + " · 1 HP", "hero", "🔫", true);
    banner("1 HP !!!", "red", 1500); say("НІІІІ!", 1800);
    flash(); shake = 26; ctx.sound?.("boom");
  }

  function showWin() {
    phase = "win";
    const w = winnerDot.p;
    el.kicker.textContent = `ПЕРЕМОЖЕЦЬ · РАУНД ${info.round} З ${info.totalRounds}`;
    el.name.textContent = w.name;
    el.name.style.fontSize = Math.min(132, Math.floor((W - 160) / (Math.max(6, w.name.length) * 0.62))) + "px";
    const chance = info.totalTickets ? ((w.tickets / info.totalTickets) * 100) : 0;
    el.sub.innerHTML = `${w.handle ? w.handle + " · " : ""}Квитки: <b>${w.tickets}</b> · шанс ${chance < 10 ? chance.toFixed(1) : Math.round(chance)}%`;
    el.emblem.innerHTML = "";
    const av = ctx.privacy?.avatars && w.avatar;
    if (av) { const im = new Image(); im.src = w.avatar; im.onerror = () => { el.emblem.textContent = initial(w.name); }; el.emblem.append(im); }
    else el.emblem.textContent = initial(w.name);
    el.win.classList.add("on");
    el.al.textContent = "ЖИВИХ"; el.n.textContent = 1; hudAlive = 1;
    el.zk.textContent = "ПЕРЕМОГА"; el.zv.textContent = "#1 🎃"; el.zone.classList.remove("hot");
    for (let i = 0; i < 220; i++) confetti.push({ x: Math.random() * W, y: -Math.random() * H * 0.8, vy: 120 + Math.random() * 260, vx: (Math.random() - 0.5) * 120, c: COLORS[(Math.random() * 3) | 0], s: 5 + Math.random() * 7, rot: Math.random() * 6 });
    ctx.sound?.("win"); ctx.sound?.("boom"); say("ГГ!!! ВІТАЮ!!!", 4000); banner("", "", 1);
    flash("white"); shake = ctx.reducedMotion ? 0 : 20;
    setTimeout(() => { const r = rollResolve; rollResolve = null; r?.(); }, 700);
  }
  const initial = (n) => (n.trim()[0] || "?").toUpperCase();

  function reset() {
    phase = "idle"; info = info; winnerDot = null; fin = []; aliveArr = [];
    for (const d of dots) { d.role = 0; d.hp = 1; d.out = 0; d.alive = !d.won; d.spawn = now + Math.random() * 1.2; d.bx = d.bx; d.x = d.bx; d.y = d.by; }
    cg.clearRect(0, 0, W, H); particles.length = 0; tracers.length = 0; confetti.length = 0;
    el.win.classList.remove("on"); el.banner.classList.remove("on"); el.bubble.classList.remove("on");
    el.zone.classList.remove("hot");
    for (const r of feedRows) r.row.remove(); feedRows.length = 0;
    cam = { x: W / 2, y: H / 2, s: 1 }; shake = 0;
    const r = rollResolve; rollResolve = null; r?.();
    recount(); hudIdle();
  }

  // ----- simulation -----
  function stepRoll(dt) {
    st += dt;
    const z = zoneAt(st);
    // stage banners
    const stageKey = st < T.S1a ? 0 : st < T.S1b ? 1 : st < T.S2a ? 1.5 : st < T.S2b ? 2 : st < T.S3a ? 2.5 : st < T.S3b ? 3 : 4;
    if (stageKey !== lastStage) {
      lastStage = stageKey;
      if (stageKey === 1) { banner("ЗОНА 1 · ЗАКРИВАЄТЬСЯ", "red", 1700); ctx.sound?.("whoosh"); }
      if (stageKey === 2) { banner("ЗОНА 2 · ТІСНІШЕ!", "red", 1700); ctx.sound?.("whoosh"); say("ХТО НЕ ВСТИГ?!", 1800); flash(); }
      if (stageKey === 3) { banner("ОСТАННЯ ЗОНА", "red", 1700); ctx.sound?.("whoosh"); say("ЛИШИЛОСЬ ТРОХИ...", 2000); flash(); }
      if (stageKey === 4) { banner(fin.length >= 3 ? "ФІНАЛ · ЛИШИЛОСЬ 3" : "ФІНАЛ", "green", 1700); ctx.sound?.("boom"); shake = 12; }
      if (stageKey === 1.5 || stageKey === 2.5) ctx.sound?.("boom");
    }
    if (stageKey >= 1 && stageKey < 4 && Math.floor(st * 1.4) !== Math.floor((st - dt) * 1.4)) { if (stageKey === 1 || stageKey === 2 || stageKey === 3) ctx.sound?.("tick"); }
    if (stageKey >= 4 && st - lastBeat > 0.8) { lastBeat = st; ctx.sound?.("drum"); }
    el.zone.classList.toggle("hot", z.shrink);
    el.zk.textContent = stageKey >= 4 ? "ФІНАЛ" : `ЗОНА ${Math.min(3, z.stage)}/3`;
    el.zv.textContent = stageKey >= 4 ? "ДУЕЛЬ" : z.shrink ? "ЗАКРИВАЄТЬСЯ" : `0:0${Math.max(0, Math.ceil(z.wait))}`;

    // movement + zone damage
    const duel = st >= T.S3b;
    for (const d of dots) {
      if (!d.alive) continue;
      const dxz = d.bx - z.x, dyz = d.by - z.y, dist = Math.hypot(dxz, dyz);
      if (d.role > 0) {
        let tx, ty, sp;
        if (duel || st > T.S3a) {
          const a = d.slot * 2.094 + 0.7, fz = zones[3];
          tx = fz.x + Math.cos(a) * 34; ty = fz.y + Math.sin(a) * 34; sp = 150;
          if (!duel && dist < z.r - 20) { tx = d.bx; ty = d.by; }
        } else if (dist > z.r - 25) { tx = z.x; ty = z.y; sp = 240; } else { tx = d.bx; ty = d.by; sp = 0; }
        const dd = Math.hypot(tx - d.bx, ty - d.by);
        if (dd > 1 && sp) { const m = Math.min(dd, sp * dt); d.bx += (tx - d.bx) / dd * m; d.by += (ty - d.by) / dd * m; }
        d.out = 0;
      } else if (dist > z.r - 6) {
        d.out += dt;
        const m = Math.min(dist, 46 * dt);
        d.bx -= dxz / dist * m; d.by -= dyz / dist * m;
      } else d.out = Math.max(0, d.out - dt * 2);
    }
    // deaths by curve
    const total = aliveArr.length + fin.filter((f) => f.alive).length;
    let need = total - targetAlive(st);
    if (st < T.S3b) need = Math.max(0, need); else need = aliveArr.length; // everyone left is out by the final zone
    while (need-- > 0 && aliveArr.length) {
      let best = null, bs = -1e9;
      for (let k = 0; k < 14; k++) {
        const c = aliveArr[(Math.random() * aliveArr.length) | 0];
        const sc = Math.hypot(c.bx - z.x, c.by - z.y) - z.r + c.out * 60 + (c.out > c.grace ? 400 : 0);
        if (sc > bs) { bs = sc; best = c; }
      }
      const inStorm = best.out > 0.05;
      let killer = null;
      if (!inStorm || Math.random() < 0.3) for (let k = 0; k < 5; k++) {
        const c = aliveArr[(Math.random() * aliveArr.length) | 0];
        if (c && c.alive && c !== best && (!killer || Math.hypot(c.x - best.x, c.y - best.y) < Math.hypot(killer.x - best.x, killer.y - best.y))) killer = c;
      }
      killDot(best, killer, killer ? "player" : "zone");
    }
    while (scriptI < script.length && st >= script[scriptI].t) script[scriptI++].f();
    const alive = aliveArr.length + fin.filter((f) => f.alive).length;
    if (alive !== hudAlive) { hudAlive = alive; el.n.textContent = alive; }
    return z;
  }

  // ----- camera -----
  function camTarget(z) {
    if (phase === "win") { return { x: winnerDot.x, y: winnerDot.y, s: 3 }; }
    if (phase !== "roll") return { x: W / 2, y: H / 2, s: 1 };
    let s = clamp(400 / z.r, 1, 4.3), x = z.x, y = z.y;
    if (st >= T.S3b) {
      const al = fin.filter((f) => f.alive);
      if (al.length) { x = al.reduce((a, f) => a + f.x, 0) / al.length; y = al.reduce((a, f) => a + f.y, 0) / al.length; }
      s = 4.4;
    }
    const wgt = clamp((s - 1) / 0.8, 0, 1);
    return { x: lerp(W / 2, x, wgt), y: lerp(H / 2, y, wgt), s };
  }

  // ----- render -----
  function drawLabel(text, x, y, s, hot, avatar) {
    const fs = (hot ? 21 : 15) / s;
    g.font = `800 ${fs}px "Exo 2", sans-serif`;
    const w = g.measureText(text).width, bx = x - w / 2, by = y - fs;
    for (const r of labelRects) if (bx < r[2] && bx + w > r[0] && by < r[3] && by + fs > r[1]) return;
    labelRects.push([bx, by, bx + w, by + fs]);
    g.lineWidth = 4 / s; g.strokeStyle = "#000000e6"; g.strokeText(text, x, y);
    g.fillStyle = hot ? "#fff" : "#ffe2c8"; g.fillText(text, x, y);
  }

  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000); last = t; now += dt;
    let z = null;
    if (phase === "roll") z = stepRoll(dt);
    else if (phase === "idle") radarA = (radarA + dt * 0.55) % 6.283;

    // idle motion
    for (const d of dots) {
      if (d.won) { d.x = d.bx; d.y = d.by; continue; }
      const amp = phase === "idle" ? 6 : 3;
      d.x = d.bx + Math.sin(now * 0.7 * d.sp + d.ph) * amp;
      d.y = d.by + Math.cos(now * 0.55 * d.sp + d.ph * 1.3) * amp * 0.8;
    }
    // camera
    const ct = camTarget(z || { x: W / 2, y: H / 2, r: 1250 });
    const k = 1 - Math.exp(-dt * (phase === "win" ? 2.5 : 3.2));
    cam.x = lerp(cam.x, ct.x, k); cam.y = lerp(cam.y, ct.y, k); cam.s = lerp(cam.s, ct.s, k);
    const hw = W / (2 * cam.s), hh = H / (2 * cam.s);
    const cx = clamp(cam.x, hw, W - hw), cy = clamp(cam.y, hh, H - hh);
    shake = Math.max(0, shake - dt * 40);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0e0e10"; g.fillRect(0, 0, canvas.width, canvas.height);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    const S = bk * cam.s;
    g.setTransform(S, 0, 0, S, (-cx * cam.s + W / 2 + sx) * bk, (-cy * cam.s + H / 2 + sy) * bk);
    g.imageSmoothingEnabled = cam.s < 1.3;
    g.drawImage(map.cv, 0, 0);
    g.drawImage(corpse, 0, 0);

    // radar
    if (phase === "idle") {
      if (g.createConicGradient) {
        const cgr = g.createConicGradient(radarA - 0.5, W / 2, H / 2);
        cgr.addColorStop(0, "rgba(124,255,79,0)"); cgr.addColorStop(0.08, "rgba(124,255,79,0.16)"); cgr.addColorStop(0.0805, "rgba(124,255,79,0)");
        g.fillStyle = cgr; g.beginPath(); g.arc(W / 2, H / 2, 1300, 0, 6.283); g.fill();
      }
      g.strokeStyle = "rgba(124,255,79,0.5)"; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(W / 2 + Math.cos(radarA) * 1300, H / 2 + Math.sin(radarA) * 1300); g.stroke();
    }

    // dots
    g.globalCompositeOperation = "lighter";
    const pct = clamp(150 / Math.max(1, N), 0.05, 1);
    for (const d of dots) {
      if (!d.alive && !d.won) continue;
      if (d.role === 1 && phase === "win") continue;
      let a = 1, yo = 0, sc = 1;
      if (d.spawn > now) continue;
      const age = now - d.spawn;
      if (d.spawn && age < 0.8) { const u = age / 0.8, e = 1 - (1 - u) * (1 - u); yo = -(1 - e) * 260; sc = 1 + (1 - e) * 1.2; a = Math.min(1, u * 3); if (u > 0.9 && !d.landed) d.landed = 1; }
      let col = d.col, r = d.r;
      if (d.won) { col = 4; r = d.r * 1.1; }
      else if (d.out > 0.05) col = 3;
      if (d.role > 0 && st >= T.S2b) r *= 1.5;
      if (d.role === 1 && phase === "roll" && st >= T.S3b) { /* same look as decoys: nobody is marked */ }
      const sz = r * 6.6 * sc;
      g.globalAlpha = d.won ? 0.75 : a;
      g.drawImage(stamps[col], d.x - sz / 2, d.y + yo - sz / 2, sz, sz);
      if (phase === "idle" && !d.won && (d.lbl === 0 || d.lbl < now)) {
        // radar trigger
        let df = radarA - Math.atan2(d.y - H / 2, d.x - W / 2); df = ((df % 6.283) + 6.283) % 6.283;
        if (df < 0.07 && Math.random() < pct) d.lbl = now + 2.4;
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";

    // zone
    if (z) {
      g.save();
      g.beginPath(); g.rect(-3000, -3000, 8000, 8000); g.arc(z.x, z.y, z.r, 0, 6.283); g.clip("evenodd");
      g.fillStyle = "rgba(60,10,110,0.34)"; g.fillRect(-3000, -3000, 8000, 8000);
      g.translate((now * 40) % 128, (now * 22) % 128); g.fillStyle = stormPat; g.fillRect(-3200, -3200, 8400, 8400);
      g.restore();
      g.lineWidth = 5 / cam.s + 1; g.strokeStyle = z.shrink ? "#ff4040" : "#ff8a3d"; g.shadowColor = "#ff6600"; g.shadowBlur = 24;
      g.beginPath(); g.arc(z.x, z.y, z.r, 0, 6.283); g.stroke(); g.shadowBlur = 0;
      if (z.next) {
        g.lineWidth = 3 / cam.s + 0.5; g.strokeStyle = "rgba(255,255,255,0.8)"; g.setLineDash([14 / cam.s + 4, 10 / cam.s + 4]);
        g.beginPath(); g.arc(z.next.x, z.next.y, z.next.r, 0, 6.283); g.stroke(); g.setLineDash([]);
      }
    }

    // tracers + particles
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i]; tr.life -= dt; if (tr.life <= 0) { tracers.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, tr.life * 4); g.strokeStyle = tr.hero ? "#fff3c0" : "#ffb347"; g.lineWidth = (tr.hero ? 4 : 2) / cam.s + 0.5;
      g.shadowColor = "#ff6600"; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(tr.x1, tr.y1); g.lineTo(tr.x2, tr.y2); g.stroke();
    }
    g.shadowBlur = 0; g.globalAlpha = 1;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
      g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = p.col; g.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
    g.globalAlpha = 1;

    // labels, hp, avatars
    labelRects.length = 0;
    g.textAlign = "center"; g.textBaseline = "alphabetic"; g.lineJoin = "round";
    for (const d of fin) {
      if (!d.alive || phase === "win" || phase === "idle") continue;
      if (st < T.S2b - 0.5) continue;
      const s = cam.s, yy = d.y - d.r * 1.5 - 10 / s;
      if (st >= T.S3b - 0.8) {
        const w = 70 / s, h = 7 / s, x0 = d.x - w / 2, y0 = yy + 14 / s;
        g.fillStyle = "#000000cc"; g.fillRect(x0 - 1 / s, y0 - 1 / s, w + 2 / s, h + 2 / s);
        g.fillStyle = d.hp < 0.3 ? "#ff3030" : "#7cff4f"; g.fillRect(x0, y0, w * d.hp, h);
      }
      drawLabel(d.p.name, d.x, yy, s, true);
    }
    if (phase === "idle" || (phase === "roll" && st < T.S3a)) {
      const show = N <= 40;
      let drawn = 0;
      for (const d of dots) {
        if (!d.alive && !d.won) continue;
        if (d.role > 0 && phase === "roll" && st >= T.S2b - 0.5) continue;
        if (d.spawn > now) continue;
        const persistent = show || (d.won) || (phase === "idle" && (d.p.tickets || 0) >= 4 && N > 40 && (hash(d.id) % 5 === 0));
        const on = persistent || (d.lbl > now);
        if (!on || drawn > 60) continue;
        drawn++;
        g.globalAlpha = d.won ? 1 : Math.min(1, (d.lbl - now) * 2 + (persistent ? 1 : 0));
        drawLabel((d.won ? "★ " : "") + d.p.name, d.x, d.y - d.r * 1.8 - 6 / cam.s, cam.s, d.won);
        g.globalAlpha = 1;
      }
    }
    if (phase === "roll" && st > T.S2a && st < T.S3b - 0.2) {
      let n = 0;
      for (const d of aliveArr) { if (n > 24) break; if (Math.hypot(d.x - z.x, d.y - z.y) < z.r) { n++; drawLabel(d.p.name, d.x, d.y - d.r * 1.8 - 6 / cam.s, cam.s, false); } }
    }

    // screen-space overlays
    g.setTransform(bk, 0, 0, bk, 0, 0);
    if (phase === "roll" && z && z.shrink && !ctx.reducedMotion) {
      const gr = g.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 1150);
      gr.addColorStop(0, "rgba(255,40,40,0)"); gr.addColorStop(1, `rgba(255,40,40,${0.16 + 0.08 * Math.sin(now * 8)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    } else {
      const gr = g.createRadialGradient(W / 2, H / 2, 420, W / 2, H / 2, 1180);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.62)");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.y += c.vy * dt; c.x += c.vx * dt + Math.sin(now * 3 + c.rot) * 0.6; c.rot += dt * 3;
      if (c.y > H + 20) { if (phase === "win") { c.y = -20; } else { confetti.splice(i, 1); continue; } }
      g.fillStyle = c.c; g.fillRect(c.x, c.y, c.s, c.s);
    }
    if (phase === "idle") {
      hudAlive = N;
    }
  }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });

  const onVis = () => { last = performance.now(); };
  document.addEventListener("visibilitychange", onVis);
  setTimeout(() => say("Шукай себе на карті, чат!", 4500), 800);

  return {
    setParticipants,
    roll,
    reset,
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVis);
      clearTimeout(bannerT); clearTimeout(bubbleT);
      link.remove(); root.innerHTML = ""; root.classList.remove("wr-root");
    },
  };
}
