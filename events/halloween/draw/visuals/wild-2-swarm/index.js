// «Рій душ»: учасники — це душі (піксельні гарбузи, привиди, кажани), що живуть роєм-вихором.
// Ролл: вихор стискається, гарбуз «з'їдає» більшість душ (вони падають купою на кладовище),
// череп з'їдає ще, лишаються фіналісти в магічному колі, стрілка робить хибну зупинку й нарешті
// стає на переможця. Тоді вся купа воскресає і складається в ім'я переможця (+ портрет-мозаїка).
// Переможець відомий з самого початку: він завжди в наборі «тих, хто вижив» на кожному етапі,
// а стрілка рухається до його слота за заздалегідь порахованим шляхом. Нічого випадкового в фіналі.

import * as px from "../pixel-kit.js";

export const meta = { id: "wild-2-swarm", title: "Рій душ: качок-ведучий", author: "agent-wild-2" };

const W0 = 1920, H0 = 1080, CX = 960, CY = 500, FLOOR = 1042;
const ORB = 0, SEEK = 1, FALL = 2, PILE = 3, HIDE = 4;
const SPR_URL = (n) => new URL(`../../assets/sprites/${n}.png`, import.meta.url).href;
const ASSET_URL = (n) => new URL(`./assets/${n}.webp`, import.meta.url).href;
// Речь ведущего: медленная печать (симв/с) и минимум секунд, которые строка висит после того, как допечаталась.
const CPS = 20, HOLD = 2.6;
// Файлы в ./assets (пиксель-арт, webp). Покадровые ленты режутся на равные ячейки по числу кадров.
// Старі sky/far/near/moon/cloud/frame/plaque/dialog/circle/pointer більше не вантажимо: фон = scenes/bg-night, рамки й стрілка малюються кодом (pixel-kit).
const ASSET_NAMES = ["host-idle", "host-present", "host-talk", "host-point", "host-oops", "host-cheer", "glutton", "skull", "souls", "bats"];
const FRAMES = { glutton: 3, skull: 3, bats: 4 };
const SOUL_COLS = 4, SOUL_ROWS = 3;

// ---------- utils ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeOutBack = (u) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
function hash(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, rnd) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
const loadImg = (src, cors) => new Promise((res) => { const i = new Image(); if (cors) i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// ---------- pixel art for souls ----------
const PAL = { o: "#ff7a1a", O: "#c94400", g: "#5fd02f", y: "#ffe04a", k: "#1a0f08", w: "#eafff0", W: "#9fe3b8", b: "#a66bff", B: "#6a2fd0" };
const ART = [
  ["....g....", ".ooogooo.", "ooooooooo", "oyyoooyyo", "ooooooooo", "oyoyoyoyo", ".ooooooo.", "..OOOOO.."], // pumpkin
  ["...www...", "..wwwww..", ".wwwwwww.", ".wkwwwkw.", ".wwwwwww.", ".wwwkwww.", "wwwwwwwww", "wwwwwwwww", "wW.www.Ww"], // ghost
  ["b.b...b.b", "bbb.b.bbb", "bbbbbbbbb", "bbybbbybb", ".bBbbbBb.", "..b...b.."], // bat
];
const KIND_COL = ["#ff6600", "#9fffc8", "#8a3ffc", "#ffd84a"];
const spriteCache = new Map();
function spriteFor(kind, dead, k) {
  const key = kind * 1000 + (dead ? 500 : 0) + k;
  let c = spriteCache.get(key);
  if (c) return c;
  const art = ART[kind];
  c = document.createElement("canvas");
  c.width = 9 * k; c.height = art.length * k;
  const g = c.getContext("2d");
  for (let y = 0; y < art.length; y++) for (let x = 0; x < 9; x++) {
    const ch = art[y][x];
    if (ch === ".") continue;
    g.fillStyle = PAL[ch]; g.fillRect(x * k, y * k, k, k);
  }
  if (dead) { g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(34,26,60,.62)"; g.fillRect(0, 0, c.width, c.height); }
  spriteCache.set(key, c);
  return c;
}
// ---------- новые пиксель-арт ассеты ----------
const A = {};            // name -> HTMLImageElement
const soulCache = new Map();
// Душа из атласа souls.webp: ряд = вид (гарбуз / привид / кажан-привид), колонки 0-1 обычная (2 кадра), 2-3 «элітна» (4+ квитків).
function soulSprite(kind, elite, fr, dead, wpx) {
  const at = A.souls;
  if (!at) return null;
  const key = ((kind * 2 + elite) * 2 + fr) * 2 + (dead ? 1 : 0) + wpx * 64;
  let c = soulCache.get(key);
  if (c) return c;
  const cw = at.width / SOUL_COLS, chh = at.height / SOUL_ROWS;
  // сперва ужимаем клетку до «арт-пикселей» (ps экранных px на пиксель), потом растим без сглаживания
  const ps = Math.max(1, Math.round(wpx / 48)), n = Math.max(4, Math.round(wpx / ps)), m = Math.max(1, Math.round((n * chh) / cw));
  const lo = document.createElement("canvas"); lo.width = n; lo.height = m;
  const lg = lo.getContext("2d");
  lg.imageSmoothingEnabled = true; lg.imageSmoothingQuality = "high";
  lg.drawImage(at, ((elite ? 2 : 0) + fr) * cw, kind * chh, cw, chh, 0, 0, n, m);
  if (dead) { lg.globalCompositeOperation = "source-atop"; lg.fillStyle = "rgba(24,18,46,.66)"; lg.fillRect(0, 0, n, m); }
  if (ps === 1) { soulCache.set(key, lo); return lo; }
  c = document.createElement("canvas"); c.width = n * ps; c.height = m * ps;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.drawImage(lo, 0, 0, c.width, c.height);
  soulCache.set(key, c);
  return c;
}

// ---------- shapes sampled into point clouds ----------
function maskPoints(drawFn, w, h, step, rnd) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  drawFn(g, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const edge = [], inner = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const xi = clamp(Math.round(x + (rnd() - 0.5) * step), 0, w - 1), yi = clamp(Math.round(y + (rnd() - 0.5) * step), 0, h - 1);
    if (A(xi, yi) < 128) continue;
    const e = A(xi - 7, yi) < 128 || A(xi + 7, yi) < 128 || A(xi, yi - 7) < 128 || A(xi, yi + 7) < 128;
    (e ? edge : inner).push([xi - w / 2, yi - h / 2]);
  }
  return { edge, inner };
}
function drawPumpkin(g) {
  g.fillStyle = "#fff";
  const el = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
  el(280, 295, 125, 190); el(168, 305, 115, 168); el(392, 305, 115, 168); el(92, 325, 68, 125); el(468, 325, 68, 125);
  g.beginPath(); g.moveTo(262, 60); g.lineTo(318, 56); g.lineTo(336, 138); g.lineTo(250, 142); g.fill();
  g.globalCompositeOperation = "destination-out";
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  poly([[165, 262], [250, 262], [208, 188]]); poly([[310, 262], [395, 262], [352, 188]]); poly([[280, 300], [250, 348], [310, 348]]);
  poly([[138, 388], [190, 372], [232, 412], [280, 376], [328, 412], [370, 372], [422, 388], [392, 452], [330, 430], [280, 468], [230, 430], [168, 452]]);
}
function drawSkull(g) {
  g.fillStyle = "#fff";
  g.beginPath(); g.ellipse(260, 225, 200, 200, 0, 0, 7); g.fill();
  g.beginPath(); g.roundRect(135, 350, 250, 160, 34); g.fill();
  g.globalCompositeOperation = "destination-out";
  g.beginPath(); g.ellipse(176, 262, 56, 64, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(344, 262, 56, 64, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(260, 322); g.lineTo(230, 386); g.lineTo(290, 386); g.fill();
  for (const x of [212, 254, 296]) g.fillRect(x, 440, 12, 72);
}

// ---------- particle ----------
class Pt {
  constructor() {
    this.x = CX; this.y = CY; this.vx = 0; this.vy = 0; this.a = 0; this.r = 0.5; this.w = 0.3; this.ph = 0;
    this.st = ORB; this.at = Infinity; this.nst = ORB; this.ntx = 0; this.nty = 0; this.npolar = false; this.boom = false;
    this.tx = 0; this.ty = 0; this.polar = false; this.ta = 0; this.tr = 0; this.curl = 1;
    this.kind = 0; this.tk = 1; this.kb = 3; this.sm = 1; this.smt = 1; this.dead = false; this.born = 0;
    this.part = null; this.dust = false; this.mos = false; this.cs = "#fff"; this.ds = 5; this.key = 0; this.rest = 0;
  }
}

export function mount(root, ctx) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  root.append(canvas);
  const sr = document.createElement("div");
  sr.style.cssText = "position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden";
  sr.setAttribute("aria-live", "polite");
  root.append(sr);
  const g = canvas.getContext("2d", { alpha: false });
  const reduced = !!ctx.reducedMotion;

  let cw = 1920, ch = 1080, sc = 1, ox = 0, oy = 0;
  let bg = null;
  const imgs = {};
  let alive = true;
  let T = 0, last = 0, raf = 0, FD = 1 / 60;
  const dbg = { frameMs: 0, frames: 0, phase: "idle", winner: "", remaining: 0 };
  root.__swarm = dbg;

  // world state
  let pts = [], parts = [], dusts = [];
  let wonIds = new Set(), extraWon = new Set();
  let contract = 1, spin = 1, shake = 0, flash = 0, ringRot = 0, ringA = 0, glowCol = "#ff6600", glowA = 0;
  let epoch = 0, rolling = false, phaseName = "idle";
  const heap = new Float32Array(Math.ceil(W0 / 8) + 2);
  let fx = [], conf = [];
  let tags = [], tagT = 0;
  let hud = { round: 1, total: 5, seed: "", remaining: 0, show: 0, label: "", tickets: 0 };
  let dlg = { text: "", t0: 0, talk: 0 };
  let lineEnd = 0;                 // когда текущую реплику уже можно менять (допечаталась + HOLD)
  let prize = null;                // { name, items, pic } | null — приз раунда (pic: px.prizePicture)
  let mon = null;                  // монстр-«едок» на сцене: { kind: "glutton"|"skull", t0, a, ta, lastFr }
  let ringArtA = 0, frameA = 0, oopsT = 0, prizeA = 0, prizeShake = 0;
  let idleLineT = 3, idleLineI = 0;
  let finalists = [], ring = null, ptr = 0, wSlot = -1, hitSlot = -1, hitT = 0, ptrShow = 0;
  let lastWinner = null;
  let fin = null; // finale layout & crisp text state
  const tasks = [];

  const IDLE_LINES = [
    "Привіт, чат! Це Хеллоуїн-розіграш ChiSetup. Усі ці душі хочуть виграти!",
    "Гарбуз, привид і кажан: за що душа потрапила в рій. Чим більше квитків, тим вона яскравіша.",
    "П'ять раундів, п'ять переможців. Тримайте кулаки!",
  ];

  // ---------- timeline helpers ----------
  const ABORT = Symbol("abort");
  function tween(d, fn) {
    return new Promise((res, rej) => {
      let t = 0; const ep = epoch;
      tasks.push({ rej: () => rej(ABORT), step(dt) {
        if (ep !== epoch) { rej(ABORT); return true; }
        t += dt; const u = d <= 0 ? 1 : Math.min(1, t / d); fn(u);
        if (u >= 1) { res(); return true; }
        return false;
      } });
    });
  }
  const wait = (d) => tween(d, () => {});
  // Реплика ведущего: печатается со скоростью CPS, после допечатки висит минимум HOLD секунд.
  // Пока ведущий «говорит» (печать), у него шевелится рот. Следующая реплика ждёт waitLine().
  function say(text) {
    const typeDur = text.length / CPS;
    dlg = { text, t0: T, talk: T + typeDur + 0.15 };
    lineEnd = T + typeDur + HOLD;
    sr.textContent = text;
  }
  const waitLine = () => wait(Math.max(0.01, lineEnd - T));
  const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  const prizeName = () => (prize && prize.name ? String(prize.name) : "");
  const snd = (n) => { try { ctx.sound?.(n); } catch { /* sound is optional */ } };

  // ---------- layout / resize ----------
  function resize() {
    const w = Math.max(320, root.clientWidth || ctx.size?.w || 1920), h = Math.max(180, root.clientHeight || ctx.size?.h || 1080);
    const dpr = 1;
    cw = Math.round(w * dpr); ch = Math.round(h * dpr);
    canvas.width = cw; canvas.height = ch;
    sc = Math.min(cw / W0, ch / H0);
    ox = (cw - W0 * sc) / 2; oy = (ch - H0 * sc) / 2;
    spriteCache.clear(); soulCache.clear();
    buildBg();
  }
  function buildBg() {
    bg = document.createElement("canvas"); bg.width = cw; bg.height = ch;
    const b = bg.getContext("2d");
    b.imageSmoothingEnabled = false;
    b.fillStyle = px.PAL.ink; b.fillRect(0, 0, cw, ch);
    b.save(); b.translate(ox, oy); b.scale(sc, sc);
    if (A.bg) b.drawImage(A.bg, 0, 0, W0, H0);
    else { // запасний варіант без картинки: пікселі-зірки
      const rnd = mulberry(7);
      for (let i = 0; i < 160; i++) { b.fillStyle = `rgba(244,241,234,${0.12 + rnd() * 0.35})`; const s = rnd() < 0.15 ? 4 : 2; b.fillRect(Math.floor(rnd() * W0 / 4) * 4, Math.floor(rnd() * 800 / 4) * 4, s, s); }
    }
    b.restore();
  }

  // ---------- participants ----------
  function kindOf(p) { const a = p.via?.includes("pumpkins"), o = p.via?.includes("orders"); return a && o ? 2 : o ? 1 : 0; }
  function kbFor(n, tk) { const base = n <= 40 ? 7 : n <= 200 ? 5 : n <= 700 ? 3.6 : n <= 1400 ? 2.8 : 2.3; return base * (1 + 0.2 * Math.min(tk - 1, 5)); }

  function setParticipants(list) {
    const prev = new Map(parts.map((p) => [p.part.id, p]));
    wonIds = new Set(list.filter((p) => p.won).map((p) => p.id));
    extraWon = new Set();
    const act = list.filter((p) => !p.won);
    const n = act.length;
    const D = clamp(3400 - n, 1400, 2800);
    const rnd = mulberry(1234 + n);
    const first = !pts.length;
    const out = [];
    const sorted = act.slice().sort((a, b) => (a.tickets || 1) - (b.tickets || 1));
    for (let i = 0; i < sorted.length; i++) {
      const src = sorted[i];
      let p = prev.get(src.id);
      const tk = Math.max(1, src.tickets || 1);
      if (!p) {
        p = new Pt();
        p.r = clamp(Math.sqrt(rnd()) * (0.98 - 0.07 * Math.min(tk - 1, 4)), 0.05, 0.98);
        p.a = rnd() * 6.283; p.ph = rnd() * 6.283;
        p.w = (0.22 + 0.34 / (0.35 + p.r)) * (0.8 + rnd() * 0.4);
        p.born = T + (first ? rnd() * 1.6 : rnd() * 0.4);
        p.x = CX + Math.cos(p.a) * p.r * 800 * contract; p.y = CY + Math.sin(p.a) * p.r * 330 * contract;
      }
      p.part = src; p.tk = tk; p.kind = kindOf(src); p.kb = kbFor(n, tk);
      out.push(p);
    }
    parts = out;
    // dust (decor embers) is kept between calls, resized to D
    while (dusts.length < D) {
      const p = new Pt(); p.dust = true; p.kind = 3;
      p.r = 0.55 + Math.sqrt(rnd()) * 0.55; p.a = rnd() * 6.283; p.ph = rnd() * 6.283; p.w = (0.15 + 0.25 / (0.35 + p.r)) * (0.8 + rnd() * 0.4);
      p.x = CX + Math.cos(p.a) * p.r * 800; p.y = CY + Math.sin(p.a) * p.r * 330; p.born = T;
      dusts.push(p);
    }
    dusts.length = D;
    dusts.forEach((p, i) => { p.shade = Math.floor((i / D) * 4); });
    pts = parts.concat(dusts);
    if (!rolling) { for (const p of parts) if (p.st === HIDE || p.st === PILE) { p.st = ORB; p.dead = false; } }
    hud.tickets = act.reduce((s, p) => s + (p.tickets || 1), 0);
    hud.remaining = n;
    tags = [];
  }

  // ---------- scheduled transitions ----------
  function sched(p, at, nst, tx = 0, ty = 0, polar = false) { p.at = at; p.nst = nst; p.ntx = tx; p.nty = ty; p.npolar = polar; }
  function applySched(p) {
    p.at = Infinity;
    if (p.nst === SEEK) { p.st = SEEK; p.tx = p.ntx; p.ty = p.nty; p.polar = p.npolar; if (p.polar) { p.ta = Math.atan2(p.nty - CY, p.ntx - CX) - ringRot; p.tr = Math.hypot(p.ntx - CX, p.nty - CY); } p.curl = Math.random() < 0.5 ? 1 : -1; if (!p.dust) p.dead = false; }
    else if (p.nst === FALL) {
      p.st = FALL; p.dead = true; p.smt = 1;
      p.vx = clamp(p.vx, -500, 500) * 0.5; p.vy = clamp(p.vy, -300, 300) * 0.3;
      if (p.boom) { p.vx += (Math.random() - 0.5) * 1100; p.vy -= 300 + Math.random() * 700; p.boom = false; }
    } else if (p.nst === ORB) { p.st = ORB; p.dead = false; p.smt = 1; p.polar = false; }
    else if (p.nst === HIDE) { p.st = HIDE; }
  }

  // ---------- physics step ----------
  function step(dt) {
    ringRot += dt * 0.18;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.at <= T) applySched(p);
      p.sm += (p.smt - p.sm) * (1 - Math.exp(-6 * dt));
      switch (p.st) {
        case ORB: {
          p.a += p.w * spin * dt;
          const rr = p.r * contract;
          const ox2 = CX + Math.cos(p.a) * rr * 800, oy2 = CY + Math.sin(p.a) * rr * 330 + Math.sin(p.a * 3 + T * 0.9 + p.ph) * 12 * (p.dust ? 1.6 : 1);
          const f = 1 - Math.exp(-7 * dt);
          const nx = p.x + (ox2 - p.x) * f, ny = p.y + (oy2 - p.y) * f;
          p.vx = (nx - p.x) / dt; p.vy = (ny - p.y) / dt; p.x = nx; p.y = ny;
          break;
        }
        case SEEK: {
          let tx = p.tx, ty = p.ty;
          if (p.polar) { tx = CX + Math.cos(p.ta + ringRot) * p.tr; ty = CY + Math.sin(p.ta + ringRot) * p.tr; }
          const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
          const K = 85, C = 15.5, curl = 780 * Math.min(d, 380) / 380 * p.curl;
          p.vx += (dx * K - p.vx * C - (dy / d) * curl) * dt;
          p.vy += (dy * K - p.vy * C + (dx / d) * curl) * dt;
          const sp = Math.hypot(p.vx, p.vy); if (sp > 3600) { p.vx *= 3600 / sp; p.vy *= 3600 / sp; }
          p.x += p.vx * dt; p.y += p.vy * dt;
          break;
        }
        case FALL: {
          p.vy += 2500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 0.6 * dt;
          p.x = clamp(p.x, 40, W0 - 40);
          const c = clamp(Math.floor(p.x / 8), 1, heap.length - 2);
          const half = p.kb * 4.5 * 0.5 * p.sm;
          const rest = FLOOR - heap[c] - half * 0.55;
          if (p.y >= rest) {
            p.y = rest; p.st = PILE; p.rest = 1;
            const inc = Math.max(0.35, (p.kb * 9) * (p.kb * 8) * 0.17 / 8 / 3);
            for (let j = -1; j <= 1; j++) heap[c + j] = Math.min(heap[c + j] + inc * (j === 0 ? 1.3 : 0.85), 150 + Math.random() * 20);
          }
          break;
        }
        default: break;
      }
    }
    // tasks
    for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].step(dt)) tasks.splice(i, 1);
    // fx
    for (const c of conf) { c.vy += 900 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; }
    conf = conf.filter((c) => c.life > 0 && c.y < H0 + 20);
    fx = fx.filter((f) => T - f.t0 < 0.5);
    shake = Math.max(0, shake - dt * 22); flash = Math.max(0, flash - dt * 2.2);
    ptrShow += ((rolling && finalists.length > 1 && phaseName === "pointer" ? 1 : 0) - ptrShow) * (1 - Math.exp(-8 * dt));
    hitT = Math.max(0, hitT - dt);
    ringArtA += ((rolling && (phaseName === "ring" || phaseName === "pointer") ? 1 : 0) - ringArtA) * (1 - Math.exp(-4 * dt));
    frameA = rolling || phaseName === "final" || phaseName === "done" ? frameA : Math.max(0, frameA - dt * 2);
    prizeA += ((prizeName() && !(rolling && (phaseName === "reveal" || phaseName === "final")) && phaseName !== "done" ? 1 : 0) - prizeA) * (1 - Math.exp(-3 * dt));
    prizeShake = Math.max(0, prizeShake - dt * 0.8);
    stepMon(dt);
    // idle talk + name tags
    if (!rolling && phaseName === "idle") {
      tagT -= dt;
      if (tagT <= 0 && parts.length) {
        tagT = 1.0;
        for (let k = 0; k < 4; k++) { const p = parts[Math.floor(Math.random() * parts.length)]; if (p.st === ORB && p.born <= T && (k === 3 || p.tk > 1 || Math.random() < 0.4) && !tags.some((t) => t.p === p)) { tags.push({ p, t0: T }); break; } }
        tags = tags.filter((t) => T - t.t0 < 4.2).slice(-6);
      }
    }
  }

  // ---------- drawing (піксель-арт: усе через pixel-kit, без blur/градієнтів/заокруглень) ----------
  const { PAL: KP, snap, text: ptext, box: pbox } = px;
  function wrapText(txt, maxW) {
    const words = txt.split(" "), lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  function drawPt(p) {
    if (p.born > T || p.st === HIDE) return;
    const pop = p.born + 0.55 > T ? easeOutBack(clamp((T - p.born) / 0.55, 0, 1)) : 1;
    const kk = p.kb * p.sm * pop;
    if (A.souls) {
      const wpx = clamp(Math.round((kk * 9 * 1.2 * sc) / 4) * 4, 8, 420);
      const spr = soulSprite(p.kind, p.tk >= 4 ? 1 : 0, ((T * 4 + p.ph * 1.3) | 0) & 1, p.dead, wpx);
      if (spr) {
        const w = spr.width / sc, h = spr.height / sc;
        let x = p.x, y = p.y + Math.sin(T * 3 + p.ph) * (p.st === ORB ? 2 : 0.8);
        if (p.st === SEEK) { x += Math.sin(T * 2.3 + p.ph) * 1.6; y += Math.cos(T * 1.9 + p.ph * 1.3) * 1.6; }
        g.drawImage(spr, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
        return;
      }
    }
    const kd = clamp(Math.round(kk * sc), 1, 60);
    const spr = spriteFor(p.kind, p.dead, kd);
    const w = spr.width / sc, h = spr.height / sc;
    let x = p.x, y = p.y;
    if (p.st === SEEK) { x += Math.sin(T * 2.3 + p.ph) * 1.6; y += Math.cos(T * 1.9 + p.ph * 1.3) * 1.6; }
    g.drawImage(spr, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    let dt = last ? (now - last) / 1000 : 1 / 60; last = now;
    dt = clamp(dt, 1 / 240, 1 / 20);
    T += dt; FD = dt;
    step(dt);
    draw();
    dbg.frameMs = dbg.frameMs * 0.95 + (performance.now() - t0) * 0.05; dbg.frames++;
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(bg, 0, 0);
    const shk = reduced ? 0 : shake;
    const jx = shk ? snap((Math.random() - 0.5) * shk) : 0, jy = shk ? snap((Math.random() - 0.5) * shk) : 0;
    g.setTransform(sc, 0, 0, sc, ox + jx * sc, oy + jy * sc);
    drawSky();
    drawAtmos();
    drawMonster();
    drawWinFrame();
    drawRingArt();
    drawCrisp();
    drawAvatar();
    // pile (dead) first
    for (let i = 0; i < parts.length; i++) { const p = parts[i]; if (p.dead && (p.st === PILE || p.st === FALL)) drawPt(p); }
    drawDust();
    for (let i = 0; i < parts.length; i++) { const p = parts[i]; if (!p.dead && p !== fin?.W) drawPt(p); }
    if (fin?.W) drawWinnerSoul();
    drawRing();
    drawFx();
    drawNameTags();
    drawHud();
    drawHost();
    drawDialog();
    if (flash > 0.01 && !reduced) { g.fillStyle = `rgba(255,236,200,${Math.ceil(flash * 3) / 3 * 0.5})`; g.fillRect(-40, -40, W0 + 80, H0 + 80); }
  }

  let dustPal = ["#6b7280", "#ff6600", "#8a93a6", "#c9c4b8"];
  function drawDust() {
    // batched by shade; mosaic dust carries its own colour. Squares snap to the 4 px art grid.
    const pal = dustPal;
    for (let s = 0; s < 4; s++) {
      g.fillStyle = pal[s];
      for (let i = 0; i < dusts.length; i++) {
        const p = dusts[i]; if (p.shade !== s || p.mos || p.st === HIDE) continue;
        const d = Math.max(4, snap(p.ds * (p.st === ORB ? 0.6 : 1)));
        g.fillRect(snap(p.x - d / 2), snap(p.y - d / 2), d, d);
      }
    }
    let last = null;
    for (let i = 0; i < dusts.length; i++) {
      const p = dusts[i]; if (!p.mos || p.st === HIDE) continue;
      if (p.cs !== last) { g.fillStyle = p.cs; last = p.cs; }
      const d = Math.max(4, snap(p.ds));
      g.fillRect(snap(p.x - d / 2), snap(p.y - d / 2), d, d);
    }
  }

  // ---------- жива сцена: зірки, світлячки, кажани (фон — scenes/bg-night) ----------
  const tw = Array.from({ length: 22 }, (_, i) => { const r = mulberry(900 + i); return { x: Math.floor(r() * 1900 / 4) * 4, y: Math.floor(r() * 640 / 4) * 4, ph: r() * 6.28, sp: 0.8 + r() * 1.8, c: ["#f4f1ea", "#ffb15c", "#f4f1ea"][i % 3] }; });
  const flies = Array.from({ length: 22 }, (_, i) => { const r = mulberry(5000 + i); return { x: r() * W0, y: 700 + r() * 330, ph: r() * 6.28, sp: 0.25 + r() * 0.5, c: i % 3 === 0 ? "#ff6600" : (i % 7 === 1 ? "#7cff4f" : "#ffb15c") }; });
  const bats = Array.from({ length: 4 }, (_, i) => ({ x: i * 520 - 100, y: 220 + (i * 97) % 260, v: (i % 2 ? -1 : 1) * (70 + i * 24), ph: i * 1.7, s: 0.8 + (i % 3) * 0.25 }));

  function drawSky() {
    for (const t of tw) {
      if (Math.sin(T * t.sp + t.ph) < 0.3) continue; // on/off, no fades
      g.fillStyle = t.c; g.fillRect(t.x, t.y, 4, 4);
    }
  }
  // світлячки й кажани: поверх фону
  function drawAtmos() {
    const k = reduced ? 0.4 : 1;
    for (const f of flies) {
      const x = f.x + Math.sin(T * f.sp + f.ph) * 60, y = f.y + Math.cos(T * f.sp * 1.3 + f.ph) * 34, on = Math.sin(T * 1.7 + f.ph * 3) > -0.2;
      if (!on) continue;
      px.ember(g, x, y, 4, f.c);
    }
    const bi = A.bats;
    for (const b of bats) {
      b.x += b.v * FD * k; if (b.v > 0 && b.x > W0 + 90) { b.x = -90; b.y = 200 + Math.random() * 300; } else if (b.v < 0 && b.x < -90) { b.x = W0 + 90; b.y = 200 + Math.random() * 300; }
      const y = snap(b.y + Math.sin(T * 1.2 + b.ph) * 22);
      if (bi) {
        const n = FRAMES.bats, fw = bi.width / n, fr = Math.floor((T * 9 + b.ph * 3) % n), w = Math.round(fw * 0.6 * b.s), h = Math.round(bi.height * 0.6 * b.s);
        if (b.v < 0) { g.save(); g.translate(snap(b.x), y); g.scale(-1, 1); g.drawImage(bi, fr * fw, 0, fw, bi.height, -w / 2, -h / 2, w, h); g.restore(); }
        else g.drawImage(bi, fr * fw, 0, fw, bi.height, snap(b.x) - w / 2, y - h / 2, w, h);
      } else {
        const flap = Math.sin(T * 9 + b.ph) > 0 ? 1 : 0.4;
        g.fillStyle = "#0e0e10"; g.fillRect(snap(b.x) - 4, y, 8, 8); g.fillRect(snap(b.x) - 16, y - 8 * flap, 12, 8); g.fillRect(snap(b.x) + 4, y - 8 * flap, 12, 8);
      }
    }
  }
  // ---------- монстр-«їдок» (гарбуз / череп): ассет із 3 кадрів ----------
  function monStart(kind) {
    if (!A[kind]) { mon = null; return; }
    mon = { kind, t0: T - 0.5, a: mon ? mon.a : 0, ta: 1, lastFr: -1, born: T };
  }
  function monFrame() {
    const c = (T - mon.t0) % 1.25;
    return c < 0.62 ? 1 : c < 0.8 ? 2 : 0;
  }
  function stepMon(dt) {
    if (!mon) return;
    mon.a += (mon.ta - mon.a) * (1 - Math.exp(-5 * dt));
    if (mon.ta === 0 && mon.a < 0.02) { mon = null; return; }
    const fr = monFrame();
    if (fr === 2 && mon.lastFr !== 2 && mon.ta > 0) { // «ам!»: тряска й іскри
      shake = Math.max(shake, 6);
      fx.push({ x: CX + (Math.random() - 0.5) * 120, y: CY + 50, t0: T, s: 2.4 });
    }
    mon.lastFr = fr;
  }
  function drawMonster() {
    if (!mon) return;
    const im = A[mon.kind]; if (!im) return;
    const n = FRAMES[mon.kind], fw = im.width / n, fr = monFrame();
    const pop = easeOutBack(clamp((T - mon.born) / 0.7, 0, 1));
    const hgt = Math.round((mon.kind === "skull" ? 640 : 590) * pop), wd = Math.round(hgt * fw / im.height);
    const y = snap(CY + (mon.kind === "skull" ? 30 : 12) + Math.sin(T * 2.6) * 7);
    const qa = Math.round(mon.a * 4) / 4;
    g.globalAlpha = qa * 0.7;
    g.drawImage(im, fr * fw, 0, fw, im.height, Math.round(CX - wd / 2), Math.round(y - hgt / 2), wd, hgt);
    g.globalAlpha = 1;
  }

  // ---------- магічне коло та стрілка (малюємо кодом, 4-px сітка) ----------
  let ringLayer = null, ringLayerR = -1;
  function drawRingArt() {
    if (ringArtA < 0.02 || !ring) return;
    const Rr = ring.R + 125, a = Math.round(ringArtA * 5) / 5;
    if (!ringLayer) ringLayer = px.lowres(W0, H0);
    if (ringLayerR !== Rr) { // статичні кільця — один раз у низькій роздільності
      const lg = ringLayer.begin(), ri = Math.round(Rr * 0.6);
      px.circle(lg, CX, CY, Rr + 8, KP.ink, 3); px.circle(lg, CX, CY, Rr + 4, KP.orange, 1);
      px.circle(lg, CX, CY, ri + 8, KP.ink, 3); px.circle(lg, CX, CY, ri + 4, KP.violet, 1);
      ringLayerR = Rr;
    }
    g.globalAlpha = a; ringLayer.blit(g);
    // руни, що крутяться
    const rot = ringRot * 0.7, step4 = Math.floor(T * 4);
    for (let i = 0; i < 16; i++) {
      const an = (i / 16) * Math.PI * 2 + rot, rr = Rr * 0.8, x = snap(CX + Math.cos(an) * rr), y = snap(CY + Math.sin(an) * rr);
      const hot = (i + step4) % 4 === 0;
      g.fillStyle = KP.ink; g.fillRect(x - 8, y - 8, 16, 16);
      g.fillStyle = hot ? KP.slime : KP.violet; g.fillRect(x - 4, y - 4, 8, 8);
    }
    for (let i = 0; i < 8; i++) { // «плюси» на зовнішньому кільці
      const an = (i / 8) * Math.PI * 2 - rot * 0.6, x = snap(CX + Math.cos(an) * (Rr - 14)), y = snap(CY + Math.sin(an) * (Rr - 14));
      g.fillStyle = KP.ink; g.fillRect(x - 8, y - 16, 16, 32); g.fillRect(x - 16, y - 8, 32, 16);
      g.fillStyle = KP.amber; g.fillRect(x - 4, y - 12, 8, 24); g.fillRect(x - 12, y - 4, 24, 8);
    }
    g.globalAlpha = 1;
  }

  // ---------- ведучий-качок ----------
  const VOWELS = "аеєиіїоуюяaeiouyАЕЄИІЇОУЮЯAEIOUY";
  function mouthOpen() {
    const f = (T - dlg.t0) * CPS, i = Math.floor(f);
    if (i >= dlg.text.length) return false;
    return VOWELS.includes(dlg.text[Math.max(0, i - 1)] || "") && f - i < 0.8;
  }
  function hostImg() {
    const talking = T < dlg.talk;
    if (phaseName === "reveal" || phaseName === "final" || phaseName === "done") return "host-cheer";
    if (T < oopsT) return "host-oops";
    if (phaseName === "pointer" || phaseName === "ring") return "host-point";
    if (talking) return mouthOpen() ? "host-talk" : "host-present";
    return "host-idle";
  }
  const HOST_H = 440;
  function hostRect() { const im = A["host-idle"]; if (!im) return { w: 190, k: 2 }; const k = HOST_H / im.height; return { w: im.width * k, k }; }
  function drawHost() {
    const nm = hostImg(), im = A[nm] || A["host-idle"];
    if (!im) return;
    const k = HOST_H / im.height, w = Math.round(im.width * k);
    const bob = nm === "host-cheer" ? snap(Math.abs(Math.sin(T * 5)) * 18) : 0;
    const h = Math.round(im.height * k);
    g.drawImage(im, -14, H0 - 4 - h - bob, w, h);
  }

  // ---------- рамка картки переможця ----------
  function drawWinFrame() {
    if (frameA < 0.02) return;
    const fx0 = 330, fy0 = 96, fw = 1260, fh = 836;
    g.globalAlpha = Math.round(frameA * 5) / 5;
    pbox(g, fx0, fy0, fw, fh, { frame: KP.orange, fill: KP.plum, shadow: false });
    g.fillStyle = KP.rust; // внутрішня лінія й «заклепки»
    g.fillRect(fx0 + 24, fy0 + 24, fw - 48, 4); g.fillRect(fx0 + 24, fy0 + fh - 28, fw - 48, 4);
    g.fillRect(fx0 + 24, fy0 + 24, 4, fh - 48); g.fillRect(fx0 + fw - 28, fy0 + 24, 4, fh - 48);
    g.fillStyle = KP.amber;
    for (const [cx, cy] of [[fx0 + 16, fy0 + 16], [fx0 + fw - 32, fy0 + 16], [fx0 + 16, fy0 + fh - 32], [fx0 + fw - 32, fy0 + fh - 32]]) g.fillRect(cx, cy, 16, 16);
    g.globalAlpha = 1;
  }

  function drawWinnerSoul() {
    const p = fin.W;
    if (p.st === HIDE) return;
    drawPt(p);
  }

  function drawRing() {
    if (!ring || !finalists.length) return;
    const R = ring.R;
    for (let j = 0; j < finalists.length; j++) {
      const f = finalists[j];
      if (f.gone) continue;
      const isHit = hitSlot === j && hitT > 0;
      if (!fin && (f.st === SEEK || f.st === ORB)) {
        const lbl0 = f.p.part.name, lbl = lbl0.length > 14 ? lbl0.slice(0, 13) + "…" : lbl0;
        const w = Math.min(Math.round(px.measure(g, lbl, 24)) + 36, 340);
        const x = f.p.x, y = f.p.y + f.p.kb * 9 * f.p.sm * 0.5 + 38;
        pbox(g, snap(x - w / 2), snap(y - 20), snap(w), 40, { frame: isHit ? KP.gold : KIND_COL[f.p.kind], fill: isHit ? KP.violet : KP.plum, shadow: false });
        ptext(g, lbl, x, y + 2, { size: Math.min(24, px.fit(g, lbl, 24, w - 28)), align: "center", ink: false });
      }
    }
    if (ptrShow > 0.02) {
      const ang = ring.a0 + (ptr * 2 * Math.PI) / finalists.length, ca = Math.cos(ang), sa = Math.sin(ang);
      const pulse = Math.floor(T * 10) % 2, len = R - 6;
      g.globalAlpha = Math.round(ptrShow * 4) / 4;
      const sq = (d, o, s, col) => { const x = CX + ca * d - sa * o, y = CY + sa * d + ca * o; g.fillStyle = col; g.fillRect(snap(x) - s / 2, snap(y) - s / 2, s, s); };
      // древко: ink-контур 16, кістка 8
      for (let d = 40; d <= len - 48; d += 8) sq(d, 0, 16, KP.ink);
      for (let t = 0; t <= 56; t += 8) { const hw = 28 * (1 - t / 56); for (let o = -hw; o <= hw; o += 8) sq(len - 56 + t, o, 16, KP.ink); }
      for (let d = 40; d <= len - 48; d += 8) sq(d, 0, 8, KP.bone);
      for (let t = 0; t <= 56; t += 8) { const hw = 28 * (1 - t / 56) - 4; for (let o = -hw; o <= hw; o += 8) sq(len - 56 + t, o, 8, pulse ? KP.amber : KP.orange); }
      px.disc(g, CX, CY, 32, KP.ink); px.disc(g, CX, CY, 24, KP.orange); px.disc(g, CX, CY, 8, KP.ink);
      g.globalAlpha = 1;
    }
  }

  const sparkImg = () => imgs.spark;
  function drawFx() {
    const sp = sparkImg();
    for (const f of fx) {
      if (!sp) continue;
      const fr = Math.min(4, Math.floor(((T - f.t0) / 0.5) * 5));
      const s = f.s; g.drawImage(sp, fr * 39, 0, 39, 36, Math.round(f.x - 39 * s / 2), Math.round(f.y - 36 * s / 2), Math.round(39 * s), Math.round(36 * s));
    }
    for (const c of conf) { g.fillStyle = KP.ink; g.fillRect(snap(c.x) - 4, snap(c.y) - 4, 16, 16); g.fillStyle = c.c; g.fillRect(snap(c.x), snap(c.y), 8, 8); }
  }

  function drawNameTags() {
    if (phaseName !== "idle") return;
    for (const t of tags) {
      const p = t.p; if (p.st !== ORB) continue;
      const age = T - t.t0, a = Math.min(age / 0.3, 1, (4.2 - age) / 0.5);
      if (a <= 0) continue;
      const txt = p.part.name + (p.tk > 1 ? `  x${p.tk}` : "");
      const w = Math.round(px.measure(g, txt, 24)) + 32, x = clamp(p.x, w / 2 + 14, W0 - w / 2 - 14), y = p.y - p.kb * 9 * 0.5 - 26;
      g.globalAlpha = a > 0.8 ? 1 : 0.5;
      pbox(g, snap(x - w / 2), snap(y - 18), snap(w), 36, { frame: KIND_COL[p.kind], shadow: false });
      ptext(g, txt, x, y + 2, { size: 24, align: "center", ink: false });
      g.globalAlpha = 1;
    }
  }

  function drawHud() {
    if (!rolling && phaseName === "idle") { // єдиний дрібний чип у спокої
      const st = `Учасників ${parts.length} · Квитків ${hud.tickets}`;
      const bw = snap(Math.ceil(px.measure(g, st, 24)) + 48);
      pbox(g, 56, 48, bw, 56, { frame: KP.orange, shadow: false });
      ptext(g, st, 56 + 24, 78, { size: 24, color: KP.bone, ink: false });
    }
    if (phaseName !== "idle") {
      const a = phaseName === "reveal" || phaseName === "final" ? Math.max(0, 1 - (fin?.hudFade ?? 0)) : 1;
      if (a > 0.01) {
        g.globalAlpha = Math.round(a * 4) / 4;
        ptext(g, hud.label || "ЛИШИЛОСЬ ДУШ", CX, 126, { size: 24, color: KP.amber, align: "center", ls: 2, depth: 4 });
        if (phaseName !== "ring" && phaseName !== "pointer") ptext(g, String(Math.round(hud.remaining)), CX, 206, { size: 92, color: KP.bone, align: "center", depth: 4, drop: glowCol === KP.slime ? KP.moss : KP.rust });
        g.globalAlpha = 1;
      }
    }
  }

  function drawDialog() {
    if (!dlg.text) return;
    const hr = hostRect(), hasHost = !!A["host-idle"];
    const FS = 30, LH = 40;
    g.font = px.font(FS);
    const full = wrapText(dlg.text, 760);
    const lines = full.slice(0, 3);
    const tw2 = Math.max(0, ...lines.map((l) => g.measureText(l).width));
    const bx = snap(hasHost ? Math.round(hr.w * 0.74) : 40);
    const bw = snap(Math.max(560, tw2 + 96)), nL = Math.max(2, lines.length), bh = snap(48 + LH * nL);
    const by = snap(H0 - 40 - bh);
    const typed = Math.min(dlg.text.length, Math.floor((T - dlg.t0) * CPS));
    pbox(g, bx, by, bw, bh, { frame: KP.orange });
    if (hasHost) { // піксельний хвостик репліки до ведучого (сходинки)
      const ty = snap(by + bh * 0.45);
      for (let i = 0; i < 3; i++) {
        const w = (3 - i) * 8, y = ty + (i - 1) * 8;
        g.fillStyle = KP.ink; g.fillRect(bx - 8 - w, y - 4, w + 8, 16);
        g.fillStyle = KP.plum; g.fillRect(bx - 4 - w, y, w + 4, 8);
        g.fillStyle = KP.orange; g.fillRect(bx - 4 - w, y, 4, 8);
      }
    }
    const tx = bx + 40;
    let shown = typed, ly = by + (bh - lines.length * LH) / 2 + 4;
    for (const ln of lines) { ptext(g, ln.slice(0, Math.max(0, shown)), tx, ly, { size: FS, align: "left", baseline: "top", ink: false }); shown -= ln.length + 1; ly += LH; }
    if (typed < dlg.text.length && Math.floor(T * 3) % 2 === 0) { // курсор, поки друкується
      const cl = Math.max(0, lines.findIndex((_, i) => lines.slice(0, i + 1).join(" ").length >= typed));
      const pre = lines.slice(0, cl).join(" ").length + (cl ? 1 : 0), part = (lines[cl] || "").slice(0, Math.max(0, typed - pre));
      g.font = px.font(FS);
      g.fillStyle = KP.orange; g.fillRect(snap(tx + g.measureText(part).width + 6), snap(by + (bh - lines.length * LH) / 2 + 4 + cl * LH + 4), 12, 24);
    }
  }

  function drawAvatar() {
    if (!fin?.av || fin.avA <= 0.01) return;
    const size = 256, x = CX - size / 2, y = fin.portraitY - size / 2;
    g.globalAlpha = Math.round(fin.avA * 4) / 4;
    px.photo(g, fin.av, x, y, size);
    px.ring(g, x, y, size, size, KP.orange);
    g.globalAlpha = 1;
  }

  function drawCrisp() {
    if (!fin || fin.a <= 0.01) return;
    g.globalAlpha = Math.round(fin.a * 4) / 4;
    ptext(g, "ПЕРЕМОЖЕЦЬ", CX, 160, { size: 44, color: KP.slime, align: "center", ls: 14, drop: KP.moss, depth: 4 });
    if (fin.pic) { const [pw, ph] = px.prizePictureSize(fin.pic, 360); px.prizeFrame(g, fin.pic, snap(CX + 420 - pw / 2), snap(fin.portraitY - ph / 2), pw, ph); }
    ptext(g, fin.name, CX, fin.nameY, { size: fin.fs, color: KP.amber, align: "center", drop: KP.rust, depth: Math.max(4, snap(fin.fs / 28)) });
    if (fin.handle) ptext(g, fin.handle, CX, fin.nameY + fin.fs * 0.5 + 52, { size: 44, color: KP.bone, align: "center", depth: 4 });
    const my = fin.nameY + fin.fs * 0.5 + (fin.handle ? 106 : 62);
    ptext(g, fin.meta, CX, my, { size: px.fit(g, fin.meta, 30, 1120), color: "#d6d0e0", align: "center", depth: 4 });
    if (fin.prize) ptext(g, `Виграв: ${clip(fin.prize, 32)}`, CX, my + 54, { size: px.fit(g, `Виграв: ${clip(fin.prize, 32)}`, 38, 1120), color: KP.gold, align: "center", depth: 4, drop: KP.rust });
    g.globalAlpha = 1;
  }

  // ---------- shapes ----------
  const shapeCache = {};
  function shape(kind) {
    if (shapeCache[kind]) return shapeCache[kind];
    const rnd = mulberry(kind === "pumpkin" ? 11 : 22);
    const o = kind === "pumpkin" ? maskPoints(drawPumpkin, 560, 520, 4, rnd) : maskPoints(drawSkull, 520, 560, 4, rnd);
    shuffle(o.edge, rnd); shuffle(o.inner, rnd);
    return (shapeCache[kind] = o);
  }

  function ringPoints(K, R, a0, count, rnd) {
    const pts2 = [];
    const nC = Math.floor(count * 0.45), nS = Math.floor(count * 0.45);
    for (let i = 0; i < nC; i++) { const a = (i / nC) * 6.283; pts2.push([CX + Math.cos(a) * (R + 46), CY + Math.sin(a) * (R + 46)]); }
    const skip = K >= 7 ? 3 : K >= 5 ? 2 : 1;
    const vs = Array.from({ length: K }, (_, j) => [CX + Math.cos(a0 + (j * 2 * Math.PI) / K) * R, CY + Math.sin(a0 + (j * 2 * Math.PI) / K) * R]);
    if (K >= 3) for (let i = 0; i < nS; i++) {
      const e = i % K, t = Math.floor(i / K) / Math.ceil(nS / K);
      const A = vs[e], B = vs[(e + skip) % K]; pts2.push([lerp(A[0], B[0], t), lerp(A[1], B[1], t)]);
    }
    for (let i = 0; i < count - pts2.length; i++) { const a = rnd() * 6.283, rr = (0.2 + 0.2 * rnd()) * R; pts2.push([CX + Math.cos(a) * rr, CY + Math.sin(a) * rr]); }
    return pts2;
  }

  // stage: survivors go to a shape, the rest fall
  function runStage(survivors, shapeName, pal, color, rnd, tNow) {
    const pool = parts.filter((p) => !p.dead && p.st !== HIDE && p.born <= T + 5);
    const surv = new Set(survivors);
    const sh = shape(shapeName);
    const sc2 = shapeName === "pumpkin" ? 1.05 : 1.0;
    const place = ([x, y]) => [CX + x * sc2, CY + 8 + y * sc2];
    const innerQ = sh.inner.slice(); const edgeQ = sh.edge.slice();
    const M = Math.min(dusts.length * 0.92, edgeQ.length + innerQ.length);
    const nSurv = survivors.length;
    // survivors take interior points; dust takes edges then the rest
    const sp = innerQ.splice(0, nSurv).map(place);
    const rest = edgeQ.slice(0, Math.floor(M * 0.45)).concat(innerQ.slice(0, Math.max(0, Math.floor(M) - nSurv - Math.floor(M * 0.45)))).map(place);
    survivors.forEach((p, i) => { const q = sp[i % sp.length]; sched(p, T + rnd() * 0.5, SEEK, q[0], q[1]); p.smt = 1; });
    for (const p of pool) if (!surv.has(p)) { sched(p, T + 0.05 + rnd() * 0.9, FALL); p.boom = false; }
    dustPal = pal; glowCol = color;
    monStart(shapeName === "pumpkin" ? "glutton" : "skull");
    const dd = shuffle(dusts.slice(), rnd);
    dd.forEach((p, i) => { if (i < rest.length) sched(p, T + rnd() * 0.6, SEEK, rest[i][0], rest[i][1]); else sched(p, T + rnd() * 0.6, ORB); p.ds = 5; p.polar = false; });
    tween(0.9, (u) => { glowA = lerp(glowA, 1, u * 0.2); }).catch(() => {});
  }

  // ---------- the roll ----------
  async function roll(winner, info) {
    if (rolling) return;
    rolling = true; const my = ++epoch;
    if (info && info.prize !== undefined) setPrize(info.prize);
    fin = null; hud.seed = "";
    dbg.winner = winner.name; dbg.phase = "start";
    try {
      await rollInner(winner, info, my);
    } catch (e) { if (e !== ABORT) { console.error(e); } }
    rolling = false;
  }

  async function rollInner(winner, info, my) {
    // honest deterministic setup: seed derives from the winner/round/server seed only
    const rnd = mulberry(hash(`${winner.id}|${info.round}|${info.seedHash}`));
    let pool = parts.filter((p) => !p.dead || p.st !== HIDE);
    let W = parts.find((p) => p.part.id === winner.id);
    if (!W) { // winner missing in the list (shouldn't be): add him
      W = new Pt(); W.part = winner; W.tk = Math.max(1, winner.tickets || 1); W.kind = kindOf(winner); W.kb = kbFor(parts.length, W.tk);
      W.r = 0.4; W.a = rnd() * 6; W.w = 0.5; parts.push(W); pts = parts.concat(dusts);
    }
    pool = parts.filter((p) => p.st !== HIDE);
    const N = pool.length;
    // elimination order: Efraimidis-Spirakis weights by tickets, winner pinned as the last survivor
    for (const p of pool) p.key = p === W ? Infinity : Math.pow(rnd(), 1 / p.tk);
    const order = pool.slice().sort((a, b) => b.key - a.key);
    const K = Math.min(8, N);
    const c2 = Math.max(K, Math.min(N, Math.round(N * 0.045), 70));
    const c1 = Math.max(c2, Math.min(N, Math.round(N * 0.24)));
    const S1 = order.slice(0, c1), S2 = order.slice(0, c2), S3 = order.slice(0, K);
    // avatar preloading
    let avatarPromise = winner.avatar && ctx.privacy?.avatars !== false ? Promise.race([loadImg(winner.avatar), wait(6).then(() => null).catch(() => null)]) : Promise.resolve(null);

    const setCount = (from, to, d, label) => { tween(d, (u) => { hud.remaining = Math.round(lerp(from, to, easeOutCubic(u))); hud.label = label; }).catch(() => {}); };

    // 0. prelude (реплика читается целиком: ~20 симв/с + HOLD)
    phaseName = "prelude"; dbg.phase = phaseName; hud.show = 1; hud.remaining = N; hud.label = "ЛИШИЛОСЬ ДУШ"; glowCol = "#ff6600";
    say("Усі душі — у вихор!");
    snd("drum");
    await tween(2.2, (u) => { contract = 1 - 0.5 * easeInOut(u); spin = 1 + 4 * easeInOut(u); glowA = u * 0.6; });
    await waitLine();
    // 1. pumpkin
    phaseName = "cut1"; dbg.phase = phaseName; snd("boom"); shake = 14; flash = 0.5;
    say("Гарбуз-ненажера їсть душі!");
    runStage(S1, "pumpkin", ["#ff6600", "#ff8a2b", "#ffb347", "#ffd27a"], "#ff6600", rnd);
    setCount(N, c1, 2.2, "ЛИШИЛОСЬ ДУШ");
    await waitLine();
    // 2. skull
    phaseName = "cut2"; dbg.phase = phaseName; snd("boom"); shake = 16; flash = 0.5; contract = 0.5;
    say(c1 > c2 ? "Череп голодний! Хто виживе?" : "Череп придивляється…");
    runStage(S2, "skull", ["#7cff4f", "#a8ff8a", "#d4ffc4", "#f2fff0"], "#7cff4f", rnd);
    setCount(c1, c2, 2.0, "ЛИШИЛОСЬ ДУШ");
    await waitLine();
    // 3. magic circle with finalists
    phaseName = "ring"; dbg.phase = phaseName; snd("whoosh"); shake = 8;
    say(K > 1 ? `Лишилось ${K}. Коло обирає одну!` : "Лишилась одна душа.");
    if (mon) mon.ta = 0;
    const a0 = K === 2 ? Math.PI : -Math.PI / 2, R = K <= 2 ? 300 : 250;
    ring = { a0, R };
    const slots = shuffle(S3.slice(), rnd);
    wSlot = slots.indexOf(W);
    finalists = slots.map((p, j) => {
      const a = a0 + (j * 2 * Math.PI) / K, x = CX + Math.cos(a) * R, y = CY + Math.sin(a) * R;
      sched(p, T + rnd() * 0.3, SEEK, x, y); p.smt = K <= 3 ? 3.2 : 2.5; p.tk0 = p.tk;
      return { p, gone: false, st: SEEK };
    });
    for (const p of pool) if (!S3.includes(p) && !p.dead) sched(p, T + 0.05 + rnd() * 0.8, FALL);
    dustPal = ["#6b7280", "#8a3ffc", "#8a93a6", "#ff6600"]; glowCol = "#4a3a6a";
    const rp = ringPoints(K, R, a0, Math.floor(dusts.length * 0.9), rnd);
    shuffle(dusts.slice(), rnd).forEach((p, i) => { if (i < rp.length) sched(p, T + rnd() * 0.6, SEEK, rp[i][0], rp[i][1], true); else sched(p, T + rnd() * 0.6, ORB); });
    setCount(c2, K, 1.4, "ФІНАЛІСТИ");
    await wait(1.5);
    // 4. pointer with a false stop (стрілка сповільнюється ближче до кінця)
    phaseName = "pointer"; dbg.phase = phaseName; hud.label = "ФІНАЛІСТИ"; ptr = Math.floor(rnd() * K);
    let lastTick = -1, lastTickT = 0;
    const tickCheck = () => { const idx = Math.floor(ptr + 0.5); if (idx !== lastTick) { lastTick = idx; if (T - lastTickT > 0.045) { snd("tick"); lastTickT = T; } } };
    if (K > 1) {
      const s0 = ptr;
      const mod = (v) => ((v % K) + K) % K;
      const f = (wSlot + 1 + Math.floor(rnd() * (K - 1))) % K; // a wrong slot, deterministic from the seed
      const aEnd = s0 + K * 2 + mod(f - s0);
      await tween(2.7, (u) => { ptr = lerp(s0, aEnd, 1 - Math.pow(1 - u, 3.4)); tickCheck(); });
      await waitLine();
      hitSlot = f; hitT = 1.6; oopsT = T + 3.2; snd("drum"); fx.push({ x: finalists[f].p.x, y: finalists[f].p.y, t0: T, s: 3 });
      say("Ой, ні-ні-ні, не він!");
      await wait(1.3);
      const bEnd = aEnd + K + mod(wSlot - f);
      await tween(2.4, (u) => { ptr = lerp(aEnd, bEnd + 0.62, easeOutCubic(u)); tickCheck(); });
      await waitLine();
      say("Ще крок… Ні, назад!");
      await wait(1.5);
      await tween(0.9, (u) => { ptr = lerp(bEnd + 0.62, bEnd, easeInOut(u)); tickCheck(); });
      hitSlot = wSlot; hitT = 1.2;
      await waitLine();
    } else { ptr = 0; await wait(0.8); }
    await wait(0.4);
    // 5. reveal: others burst, winner grows, everything rises into the name
    phaseName = "reveal"; dbg.phase = phaseName; snd("boom"); shake = 24; flash = 1; ptrShow = 0;
    const av = await avatarPromise;
    const lay = layoutName(winner, W, rnd);
    lastWinner = W;
    fin = { W, a: 0, hudFade: 0, ...lay };
    finalists.forEach((f, j) => { if (f.p !== W) { f.gone = true; f.p.boom = true; sched(f.p, T, FALL); f.p.smt = 1.2; fx.push({ x: f.p.x, y: f.p.y, t0: T, s: 3.2 }); } });
    dlg = { text: "", t0: T, talk: 0 }; lineEnd = 0; sr.textContent = `Переможець: ${winner.name}`; // без бульбашки: картка вже каже все
    snd("win");
    if (mon) mon.ta = 0;
    for (let i = 0; i < 150; i++) conf.push({ x: CX + (rnd() - 0.5) * 300, y: CY - 100, vx: (rnd() - 0.5) * 1700, vy: -700 - rnd() * 900, c: ["#ff6600", "#c9c4b8", "#ff6600", "#ffb36b", "#8a93a6"][i % 5], life: 3 });
    W.smt = 250 / (9 * W.kb); sched(W, T, SEEK, CX, lay.portraitY);
    tween(0.6, (u) => { if (fin) fin.hudFade = u; }).catch(() => {});
    await wait(0.6);
    morph(winner, W, av, lay, rnd);
    snd("whoosh");
    phaseName = "final"; dbg.phase = phaseName; glowCol = "#ff7a1a";
    tween(1.0, (u) => { frameA = u; }).catch(() => {});
    await wait(2.1);
    await tween(0.5, (u) => { fin.a = u; });
    dbg.phase = "done"; dbg.winnerShown = fin.name; dbg.prizeShown = prizeName();
    await waitLine();
  }

  function layoutName(winner, W, rnd) {
    const name = winner.name || "—";
    const fs = px.fit(g, name, 220, 1180);
    const pz = px.prizeLabel(prizeName());
    const meta = `${winner.tickets} ${px.ticketsWord(winner.tickets)}`;
    return { name, fs, nameY: pz ? 570 : 600, portraitY: pz ? 335 : 350, handle: winner.handle, meta, prize: pz, pic: prize?.pic, a: 0 };
  }

  function sampleText(name, fs, nameY) {
    const w = 1920, h = Math.ceil(fs * 1.5);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.font = px.font(fs, 700); x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.fillText(name, w / 2, h / 2);
    const d = x.getImageData(0, 0, w, h).data, out = [], step = 8;
    for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step) if (d[(yy * w + xx) * 4 + 3] > 140) out.push([xx + 4, nameY - h / 2 + yy + 4]);
    return out;
  }

  function morph(winner, W, avImg, lay, rnd) {
    const others = parts.filter((p) => p !== W);
    // portrait mosaic from the avatar (if the browser lets us read it)
    dbg.portrait = "soul";
    if (avImg) { W.st = HIDE; fin.W = null; fin.av = avImg; fin.avA = 0; dbg.portrait = "photo"; tween(0.5, (u) => { if (fin) fin.avA = u; }).catch(() => {}); }
    const dd = shuffle(dusts.slice(), rnd);
    let di = 0;
    // text
    let tp = sampleText(lay.name, lay.fs, lay.nameY);
    const dAvail = dd.length - di, P = others.length;
    let nP = Math.min(P, Math.round(tp.length * 0.55)), nD = tp.length - nP;
    if (nD > dAvail) { nD = dAvail; nP = Math.min(P, tp.length - nD); }
    const total = nP + nD;
    if (tp.length > total) { shuffle(tp, rnd); tp = tp.slice(0, total); }
    const takers = shuffle(others.slice(), rnd).slice(0, nP).concat(dd.slice(di, di + nD));
    const extraDust = dd.slice(di + nD);
    takers.sort((a, b) => a.x - b.x); tp.sort((a, b) => a[0] - b[0]);
    const pal = ["#ff6600", "#ff8a1a", "#ffb000", "#ffd84a"];
    takers.forEach((p, i) => {
      const q = tp[i]; sched(p, T + 0.05 + rnd() * 0.9, SEEK, q[0], q[1]);
      if (p.dust) { p.polar = false; p.mos = false; p.ds = 8; p.shade = Math.min(3, Math.floor(((q[1] - (lay.nameY - lay.fs * 0.5)) / lay.fs) * 4)); }
      else p.smt = 0.55;
    });
    dustPal = pal;
    extraDust.forEach((p) => sched(p, T + 0.5 + rnd() * 1.2, HIDE));
    // leftover souls stay on the cemetery pile
    heap.fill(0);
  }

  function reset() {
    epoch++; rolling = false; phaseName = "idle"; dbg.phase = "idle";
    for (const t of tasks) t.rej?.(); tasks.length = 0;
    if (lastWinner) extraWon.add(lastWinner.part.id);
    lastWinner = null;
    mon = null; frameA = 0; oopsT = 0;
    fin = null; finalists = []; ring = null; ptrShow = 0; hitT = 0; conf = []; fx = [];
    contract = 1; spin = 1; glowA = 0; hud.show = 0; flash = 0;
    dustPal = ["#6b7280", "#ff6600", "#8a93a6", "#c9c4b8"]; glowCol = "#ff6600";
    heap.fill(0);
    // winners of finished rounds leave the swarm until the host tells us the new list
    const keep = parts.filter((p) => !extraWon.has(p.part.id));
    if (keep.length !== parts.length) { parts = keep; pts = parts.concat(dusts); hud.remaining = parts.length; hud.tickets = parts.reduce((s, p) => s + p.tk, 0); }
    for (const p of pts) { p.smt = 1; p.mos = false; p.ds = 5; p.polar = false; p.boom = false; sched(p, T + Math.random() * 0.9, ORB); if (p.st === HIDE) p.st = ORB; }
    for (const p of dusts) { p.st = p.st === HIDE ? ORB : p.st; }
    idleLineT = 6; dlg = { text: "", t0: T, talk: 0 }; tags = [];
  }

  function destroy() {
    alive = false; cancelAnimationFrame(raf); epoch++;
    removeEventListener("resize", onResize);
    canvas.remove(); sr.remove(); spriteCache.clear(); soulCache.clear();
  }
  const onResize = () => resize();
  addEventListener("resize", onResize);

  // boot
  resize();
  (async () => {
    try { await px.ensureFont(); } catch { /* ok */ }
    loadImg(px.sceneUrl("bg-night")).then((im) => { if (im) { A.bg = im; buildBg(); } });
    await Promise.all(ASSET_NAMES.map(async (n) => { const im = await loadImg(ASSET_URL(n)); if (im) A[n] = im; }));
    soulCache.clear(); buildBg();
    imgs.spark = await loadImg(SPR_URL("spark"));
  })();
  raf = requestAnimationFrame(frame);

  function setPrize(p) {
    const np = p && typeof p === "object" && p.name ? { name: String(p.name), items: Array.isArray(p.items) ? p.items.map(String).slice(0, 12) : [] } : null;
    if (np) np.pic = p.picture === prize?.pic?.url ? prize.pic : px.prizePicture(p); // loads ahead of the reveal
    if ((np && np.name) !== (prize && prize.name)) prizeShake = 1;
    prize = np;
  }
  return { setParticipants, roll, reset, destroy, setPrize };
}
