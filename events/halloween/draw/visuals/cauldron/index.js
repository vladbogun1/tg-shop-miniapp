// «Котёл ведьмы» — визуал розыгрыша в 16-битном пиксель-арте. Один canvas 2D, дизайн-сетка 1920×1080.
// До ролла души-огоньки кружат вокруг котла, в ролл их засасывает воронка, котёл трясётся, «пшик»,
// и из котла вылетает душа победителя, которую задал хост. Картинки: сцена bg-night, спрайты котла и качка
// (draw/assets). Свечение — дизерные «лужи», кромки жёсткие, текст — пиксельным шрифтом из pixel-kit.

import * as px from "../pixel-kit.js";
import { t as tr } from "../../lang.js";

export const meta = { id: "cauldron", title: "Котёл ведьмы", author: "agent" };

// ---------------------------------------------------------------- константы и утилиты
const W = 1920, H = 1080;
const P = px.PX;                     // один арт-пиксель = 4 px
const PX = 960, PY = 560;            // центр зеркала зелья (он же «устье», куда падают души)
const CY = 420;                      // центр орбит
const WX = 960, WY = 300;            // где раскрывается портрет победителя
const TAU = Math.PI * 2;
// спрайт котла (384×384, масштаб 2): зеркало зелья в нём — эллипс с центром (192,108)
const POT_S = 2, POT_CX = 192, POT_CY = 108;
const POT_X = PX - POT_CX * POT_S, POT_Y = PY - POT_CY * POT_S;
const LIQ = { rx: 224, ry: 44 };     // размеры зеркала зелья на экране

const COLS = {
  orange: { css: "#ff6600", light: "#ffb15c", dark: "#7a2c00" },
  green: { css: "#7cff4f", light: "#d6ffbd", dark: "#1f5c10" },
  violet: { css: "#8a3ffc", light: "#cfaeff", dark: "#3a1478" },
  pale: { css: "#f4f1ea", light: "#ffffff", dark: "#6b6760" },
};
const COLNAMES = Object.keys(COLS);

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const frac = (x) => x - Math.floor(x);
const snap = px.snap;
/** Alpha in a few hard steps (pixel art does not fade smoothly). */
const steps = (a, n = 4) => Math.round(clamp(a) * n) / n;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- дизерные «лужи» света на сетке 4 px (в отличие от px.glow — любой размер и эллипс)
const poolCache = new Map();
function poolSprite(color, nw, nh) {
  const key = color + "|" + nw + "|" + nh;
  let c = poolCache.get(key);
  if (c) return c;
  if (poolCache.size > 160) poolCache.clear();
  c = px.canvas(nw, nh);
  const x = c.getContext("2d"), im = x.createImageData(nw, nh), rgb = parseInt(color.slice(1), 16);
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    const d = Math.hypot((i + 0.5 - nw / 2) / (nw / 2), (j + 0.5 - nh / 2) / (nh / 2));
    const lv = Math.min(3, Math.floor(Math.max(0, 1 - d) * 3.4)); // жёсткие кольца без дизера
    if (!lv) continue;
    const k = (j * nw + i) * 4;
    im.data[k] = rgb >> 16; im.data[k + 1] = (rgb >> 8) & 255; im.data[k + 2] = rgb & 255;
    im.data[k + 3] = Math.round(255 * [0.07, 0.13, 0.24][lv - 1]);
  }
  x.putImageData(im, 0, 0);
  poolCache.set(key, c);
  return c;
}
/** A dithered light pool w×h centred at x,y. */
function halo(g, x, y, w, h, color, alpha = 1) {
  if (alpha <= 0.02 || w < 8) return;
  const nw = Math.max(2, Math.round(w / 16) * 4), nh = Math.max(2, Math.round((h ?? w) / 16) * 4);
  const a = g.globalAlpha;
  g.globalAlpha = a * Math.min(1, alpha);
  g.drawImage(poolSprite(color, nw, nh), snap(x - nw * P / 2), snap(y - nh * P / 2), nw * P, nh * P);
  g.globalAlpha = a;
}
const sq = (g, x, y, s, color) => { s = Math.max(P, snap(s)); g.fillStyle = color; g.fillRect(snap(x) - s / 2, snap(y) - s / 2, s, s); };

/** Pixel avatar: a square photo (chunky) or a colour tile with the initial, in a pixel ring. */
function avatar(g, x, y, a, name, colName, img, p, ringOn = true) {
  const cs = COLS[colName];
  x = Math.round(x); y = Math.round(y);
  if (!px.photo(g, img, x, y, a, p)) {
    g.fillStyle = cs.dark; g.fillRect(x, y, a, a);
    g.fillStyle = cs.css; g.fillRect(x, y, a, Math.round(a / 2 / P) * P);
    g.fillStyle = cs.dark; g.fillRect(x, y + Math.round(a * 0.75 / P) * P, a, P);
    const ch0 = (Array.from(name.trim())[0] || "?").toUpperCase();
    px.text(g, ch0, x + a / 2, y + a / 2 + P, { size: Math.round(a * 0.72), align: "center", color: PALbone, drop: null, depth: Math.max(P, snap(a / 14)) });
  }
  if (ringOn) px.ring(g, x, y, a, a, cs.css, P);
}
const PALbone = px.PAL.bone;

// ---------------------------------------------------------------- mount
export function mount(root, host) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;background:#0e0e10;image-rendering:pixelated";
  root.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });

  let destroyed = false, raf = 0, last = performance.now(), T = 0;
  let cw = 0, ch = 0, fit = 1, ox = 0, oy = 0;
  const reduced = !!host.reducedMotion;
  const avatarsOn = host.privacy?.avatars !== false;
  const snd = (n) => { try { host.sound?.(n); } catch { /* sound is optional */ } };

  // ---- картинки
  const bgImg = px.loadImage(px.sceneUrl("bg-night"));
  const potImg = px.loadImage(px.spriteUrl("cauldron"));
  const heroImg = px.loadImage(px.spriteUrl("host"));
  const rays = px.lowres();

  // ---- тексты (кэш битмапов пиксельным шрифтом)
  const spriteCache = new Map();
  const tctx = px.canvas(8, 8).getContext("2d");
  function textSprite(str, o) {
    const key = str + "|" + o.size + "|" + (o.color || "") + "|" + (o.drop || "") + "|" + (o.bg ? 1 : 0) + "|" + (o.ls || 0) + "|" + (o.weight || 700);
    let sp = spriteCache.get(key);
    if (sp) return sp;
    if (spriteCache.size > 400) spriteCache.clear();
    const size = o.size, depth = o.depth ?? Math.max(P, snap(size / 16)), pad = o.pad ?? 12;
    const tw = Math.ceil(px.measure(tctx, str, size, o.weight ?? 700, o.ls ?? 0));
    const extra = depth * (o.drop ? 3 : 1) + 8;
    const w = tw + 2 * pad + extra, h = Math.ceil(size * 1.4) + 2 * pad;
    const c = px.canvas(w, h), x = c.getContext("2d");
    if (o.bg) { x.fillStyle = "rgba(14,14,16,.72)"; x.fillRect(pad - 8, pad - 2, tw + 16 + depth, h - 2 * pad + 4); }
    px.text(x, str, pad, h / 2, { size, weight: o.weight ?? 700, color: o.color, drop: o.drop, depth, ls: o.ls ?? 0 });
    sp = { c, w, h, tw };
    spriteCache.set(key, sp);
    return sp;
  }
  function drawSprite(sp, cx, cy, a = 1) {
    if (a <= 0.01) return;
    g.globalAlpha = a;
    g.drawImage(sp.c, Math.round(cx - sp.w / 2), Math.round(cy - sp.h / 2));
    g.globalAlpha = 1;
  }

  // ---- аватарки
  const imgs = new Map();
  function getImg(url, onload) {
    if (!url || !avatarsOn) return null;
    let e = imgs.get(url);
    if (!e) {
      const im = new Image(); e = { im, ok: false, cbs: [] };
      im.onload = () => { e.ok = true; e.cbs.forEach((f) => f()); e.cbs = []; };
      im.onerror = () => { e.cbs = []; };
      im.src = url; imgs.set(url, e);
    }
    if (e.ok) return e.im;
    if (onload) e.cbs.push(onload);
    return null;
  }

  function resize() {
    const r = root.getBoundingClientRect();
    const cssW = Math.max(320, r.width || host.size?.w || innerWidth), cssH = Math.max(180, r.height || host.size?.h || innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = Math.round(cssW * dpr), nh = Math.round(cssH * dpr);
    fit = Math.min(nw / W, nh / H);
    if (nw !== cw || nh !== ch) { cw = nw; ch = nh; canvas.width = nw; canvas.height = nh; }
    ox = (nw - W * fit) / 2; oy = (nh - H * fit) / 2;
  }

  // ---------------------------------------------------------------- души
  const souls = [];
  const byId = new Map();
  let phase = "idle";          // idle | roll | win
  let speedMul = 1, boil = 0.35, boilTarget = 0.35, gulp = 0, shakeAmp = 0, flash = 0;
  let lastWinnerId = null, total = 0, totalTickets = 0;
  let initialDone = false;
  const lanes = [
    { R: 470, tilt: 0.2, yoff: -240, w: 0.27 }, { R: 610, tilt: 0.24, yoff: -120, w: 0.22 },
    { R: 750, tilt: 0.27, yoff: -10, w: 0.18 }, { R: 880, tilt: 0.29, yoff: 105, w: 0.155 },
  ];
  const laneOcc = lanes.map(() => []);

  function colorFor(p) {
    const a = p.via?.includes("pumpkins"), b = p.via?.includes("orders");
    return a && b ? "violet" : b ? "green" : "orange";
  }
  function sizing() {
    const n = souls.length;
    return { boost: n <= 12 ? 1.75 : n <= 40 ? 1.3 : 1.05, dust: n < 120 ? 1.8 : n < 400 ? 1.4 : n < 1000 ? 1.15 : 1 };
  }
  function configureSoul(s) {
    const p = s.p, sz = sizing();
    const col = colorFor(p);
    const tk = Math.max(1, p.tickets | 0);
    const r = s.labeled ? (17 + 7 * Math.min(Math.sqrt(tk), 4)) * sz.boost : (2.4 + 1.3 * Math.sqrt(tk)) * sz.dust;
    if (col !== s.col || r !== s.r || p.name !== s.nm || p.avatar !== s.av) { s.badge = null; s.label = null; }
    s.col = col; s.tk = tk; s.r = r; s.nm = p.name; s.av = p.avatar;
    s.glowK = s.labeled ? 3.4 : 5.4;
  }
  function makeSoul(p) {
    const rnd = mulberry(hash(p.id));
    const s = {
      id: p.id, p, rnd, labeled: false, lane: -1, ang: rnd() * TAU, ph: rnd() * TAU,
      R: 0, tilt: 0, yoff: 0, w: 0, mode: "orbit", k: 0, wait: 0, dur: 1.2, born: T, dying: 0,
      x: 0, y: 0, z: 0, sc: 1, alpha: 1, pass: 0, e: 0, col: "orange", tk: 1, r: 4, glowK: 5, badge: null, label: null, spd: 0.7 + rnd() * 0.6, trail: rnd() < 0.25,
    };
    setDustOrbit(s);
    configureSoul(s);
    return s;
  }
  function setDustOrbit(s) {
    const rnd = s.rnd;
    s.R = 340 + 560 * Math.pow(rnd(), 0.85);
    s.tilt = 0.13 + 0.27 * rnd();
    let yo = lerp(-310, 170, rnd());
    if (CY + yo + s.R * s.tilt > 1005) yo = 1005 - CY - s.R * s.tilt;
    if (CY + yo - s.R * s.tilt < 165) yo = 165 - CY + s.R * s.tilt;
    s.yoff = yo;
    s.w = (150 / s.R) * s.spd;
  }
  function setLaneOrbit(s, lane) {
    const L = lanes[lane];
    s.lane = lane; s.R = L.R; s.tilt = L.tilt; s.yoff = L.yoff + (s.rnd() - 0.5) * 36; s.w = L.w;
    // угол, максимально далёкий от соседей по кольцу
    const occ = laneOcc[lane].filter((o) => o !== s);
    let best = s.ang, bestD = -1;
    for (let i = 0; i < 16; i++) {
      const a = s.rnd() * TAU;
      let d = 9; for (const o of occ) { let dd = Math.abs(((o.ang - a) % TAU + TAU) % TAU); dd = Math.min(dd, TAU - dd); d = Math.min(d, dd); }
      if (d > bestD) { bestD = d; best = a; }
    }
    s.ang = best;
    laneOcc[lane].push(s);
  }
  function rebuildLabels() {
    const n = souls.length;
    const K = n <= 34 ? n : 34;
    const sorted = souls.filter((s) => !s.dying).sort((a, b) => b.tk - a.tk || (a.id < b.id ? -1 : 1));
    const want = new Set(sorted.slice(0, K));
    for (const s of souls) {
      if (want.has(s) && !s.labeled) {
        s.labeled = true; s.born = T;
        const lane = laneOcc.reduce((bi, o, i, arr) => (o.length / lanes[i].R < arr[bi].length / lanes[bi].R ? i : bi), 0);
        setLaneOrbit(s, lane);
      } else if (!want.has(s) && s.labeled) {
        s.labeled = false; s.born = T;
        const i = laneOcc[s.lane]?.indexOf(s); if (i >= 0) laneOcc[s.lane].splice(i, 1);
        setDustOrbit(s);
      }
    }
    for (const s of souls) configureSoul(s);
  }
  /** Значок души: квадратная пиксельная аватарка в цветной рамке (кэш битмапа 1:1). */
  function ensureBadge(s) {
    if (s.badge) return;
    const a = Math.max(24, snap(s.r * 2)), d = a + 4 * P;
    const c = px.canvas(d, d), x = c.getContext("2d");
    const img = getImg(s.p.avatar, () => { s.badge = null; });
    avatar(x, 2 * P, 2 * P, a, s.p.name, s.col, img, a < 80 ? 2 : P);
    s.badge = { c, d };
  }
  function ensureLabel(s) {
    if (s.label) return;
    const fs = Math.round(22 * Math.min(1.4, sizing().boost * 0.9));
    s.label = textSprite(s.p.name, { size: fs, color: px.PAL.bone, bg: true, pad: 8, depth: P });
  }

  function setParticipants(list) {
    const pool = (list || []).filter((p) => !p.won);
    const ids = new Set();
    for (const p of pool) {
      ids.add(p.id);
      let s = byId.get(p.id);
      if (!s) {
        s = makeSoul(p); byId.set(p.id, s); souls.push(s);
        if (phase === "idle") { s.mode = "out"; s.k = 1; s.wait = s.rnd() * (initialDone ? 0.6 : 1.8); s.dur = 1.3; }
        else { s.mode = "in"; s.k = 1; }
      } else { s.p = p; }
    }
    for (let i = souls.length - 1; i >= 0; i--) {
      const s = souls[i];
      if (!ids.has(s.id)) {
        if (s.mode === "in") removeSoul(i); else if (!s.dying) s.dying = T;
      }
    }
    initialDone = true;
    rebuildLabels();
    total = souls.length; totalTickets = souls.reduce((a, s) => a + s.tk, 0);
  }
  function removeSoul(i) {
    const s = souls[i];
    if (s.lane >= 0) { const j = laneOcc[s.lane].indexOf(s); if (j >= 0) laneOcc[s.lane].splice(j, 1); }
    byId.delete(s.id); souls.splice(i, 1);
  }

  function stepSoul(s, dt) {
    if (s.mode === "in") { s.e = 1; return false; }
    let entered = false;
    const sm = speedMul;
    if (s.mode === "orbit") s.ang += s.w * dt * sm;
    else if (s.wait > 0) { s.wait -= dt; s.ang += s.w * dt * sm; }
    else if (s.mode === "suck") {
      s.k += dt / s.dur; s.ang += s.w * dt * (sm + 7 * smooth(s.k));
      if (s.k >= 1) { s.k = 1; s.mode = "in"; entered = true; }
    } else if (s.mode === "out") {
      s.k -= dt / s.dur; s.ang += s.w * dt * (sm + 5 * smooth(s.k));
      if (s.k <= 0) { s.k = 0; s.mode = "orbit"; }
    }
    const e = smooth(s.k); s.e = e;
    const c = Math.cos(s.ang), sn = Math.sin(s.ang);
    const wob = 1 + 0.045 * Math.sin(T * 0.6 + s.ph);
    const R = s.R * wob * (1 - e);
    const tilt = lerp(s.tilt, 0.2, e);
    const bob = Math.sin(T * 1.3 + s.ph) * (s.labeled ? 12 : 16) * (1 - e);
    s.x = PX + c * R;
    s.y = CY + sn * R * tilt + lerp(s.yoff + bob, PY - CY, e);
    s.z = sn;
    const depth = (sn + 1) / 2;
    s.sc = (0.74 + 0.34 * depth) * (1 - 0.9 * e * e * e);
    let a = clamp((T - s.born) / 0.9) * (1 - smooth((e - 0.78) / 0.22));
    if (s.dying) a *= 1 - clamp((T - s.dying) / 0.7);
    s.alpha = a * (0.55 + 0.45 * depth);
    s.pass = s.k > 0.55 ? 1 : sn < 0 ? 0 : 2;
    return entered;
  }

  // ---------------------------------------------------------------- эффекты
  const sparks = [], puffs = [], bubbles = [];
  function spark(x, y, vx, vy, life, size, col, o = {}) {
    if (sparks.length > 900) return;
    sparks.push({ x, y, vx, vy, life, max: life, size, col, g: o.g ?? 0, drag: o.drag ?? 0, rect: o.rect || 0 });
  }
  function puff(x, y, vx, vy, r, life, kind = "smoke", a = 0.2) {
    if (puffs.length > 160) return;
    puffs.push({ x, y, vx, vy, r, gr: r * 0.9, life, max: life, kind, a });
  }
  const PUFF_COL = { smoke: "#a9f0b8", violet: "#8a3ffc", warm: "#ff8a2a" };
  function burst(x, y, n, speed, cols, up = 0.4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.9);
      spark(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * up, 0.6 + Math.random() * 1.0, 3 + Math.random() * 5, cols[(Math.random() * cols.length) | 0], { g: 520, drag: 0.6 });
    }
  }

  // ---------------------------------------------------------------- ролл
  let rs = null, win = null;
  const T_SUCK = 1.8, SPREAD = 2.4, SUCK_DUR = 1.4;
  const T_QUIET = T_SUCK + SPREAD + SUCK_DUR;  // 5.6
  const T_SH1 = 6.3, T_F1 = 7.3, T_SH2 = 7.8, T_F2 = 8.7, T_F2_END = 9.55, T_SH3 = 10.3, T_EJECT = 11.3, T_REVEAL = 12.2, T_END = 13.7;
  const CAPTIONS = [
    [0, 1.8, tr("Зілля закипає…", "Зелье закипает…")], [1.8, 5.6, tr("Душі злітаються до котла…", "Души слетаются к котлу…")], [5.6, 6.3, tr("Тиша…", "Тишина…")],
    [6.3, 7.4, tr("Котел здригається…", "Котёл вздрагивает…")], [7.4, 8.7, tr("Щось піднімається…", "Что-то поднимается…")], [8.7, 9.9, tr("Хибна тривога!", "Ложная тревога!")],
    [9.9, 11.3, tr("Хто ж вилетить?!", "Кто же вылетит?!")],
  ];
  const winnerPath = (u) => {
    // кубическая кривая: из устья котла по петле к портрету
    const p0 = [PX, PY - 8], p1 = [PX + 330, PY - 330], p2 = [PX - 420, WY - 150], p3 = [WX, WY];
    const t = u, it = 1 - t;
    return [
      it * it * it * p0[0] + 3 * it * it * t * p1[0] + 3 * it * t * t * p2[0] + t * t * t * p3[0],
      it * it * it * p0[1] + 3 * it * it * t * p1[1] + 3 * it * t * t * p2[1] + t * t * t * p3[1],
    ];
  };

  function startSuck() {
    const live = souls.filter((s) => s.mode !== "in" && !s.dying);
    for (const s of live) {
      s.mode = "suck";
      s.wait = SPREAD * Math.pow(s.rnd(), 0.9) * (s.k > 0 ? 0.2 : 1);
      s.dur = SUCK_DUR * (0.85 + 0.3 * s.rnd());
    }
  }

  function stepRoll(dt) {
    const rt = T - rs.t0, f = rs.f;
    const at = (name, t, fn) => { if (rt >= t && !f[name]) { f[name] = 1; fn(); } };
    const rm = reduced ? 0.45 : 1;

    // котёл: «кипение» и тряска
    let bt, sh = 0;
    if (rt < T_SUCK) bt = 0.25 + 0.75 * smooth(rt / T_SUCK);
    else if (rt < T_QUIET) bt = 1;
    else if (rt < T_SH1) bt = 0.2;
    else if (rt < T_F1) { const p = (rt - T_SH1) / (T_F1 - T_SH1); bt = 0.4 + 0.5 * p; sh = 4 + 12 * smooth(p); }
    else if (rt < T_SH2) { bt = 0.3; sh = 0; }
    else if (rt < T_F2) { const p = (rt - T_SH2) / (T_F2 - T_SH2); bt = 0.5 + 0.5 * p; sh = 7 + 20 * smooth(p); }
    else if (rt < T_SH3) bt = 0.3;
    else if (rt < T_EJECT) { const p = (rt - T_SH3) / (T_EJECT - T_SH3); bt = 0.6 + 0.4 * p; sh = 14 + 30 * smooth(p) * smooth(p); }
    else bt = rt < T_REVEAL ? 1 : 0.6;
    boilTarget = bt; shakeAmp = sh * rm;
    speedMul = rt < T_SUCK ? 1 + 1.4 * smooth(rt / T_SUCK) : 2.4;

    at("whoosh0", 0.05, () => snd("whoosh"));
    at("prep", 0.3, () => { rs.sprites = buildWinnerSprites(rs.winner, rs.info); });
    at("suck", T_SUCK, () => { startSuck(); snd("whoosh"); });
    at("w2", T_SUCK + 1.2, () => snd("whoosh"));
    at("w3", T_SUCK + 2.4, () => snd("whoosh"));
    at("drumQ", T_QUIET + 0.25, () => snd("drum"));
    for (const [i, t] of [[1, 6.5], [2, 6.85], [3, 7.1]]) at("d" + i, t, () => snd("drum"));
    at("f1", T_F1, () => {
      snd("tick"); setTimeout(() => snd("whoosh"), 60);
      for (let i = 0; i < 9; i++) puff(PX + (Math.random() - 0.5) * 120, PY - 10, (Math.random() - 0.5) * 60, -70 - Math.random() * 60, 20, 1.1, "smoke", 0.3);
      burst(PX, PY - 14, 16, 220, ["green", "pale"], 0.9);
      gulp = Math.min(1, gulp + 0.5);
    });
    for (const [i, t] of [[4, 8.0], [5, 8.25], [6, 8.45], [7, 8.6]]) at("d" + i, t, () => snd("drum"));
    at("f2up", T_F2, () => snd("whoosh"));
    at("f2end", T_F2_END, () => {
      snd("tick"); snd("boom");
      for (let i = 0; i < 18; i++) puff(PX + (Math.random() - 0.5) * 220, PY - 30, (Math.random() - 0.5) * 120, -90 - Math.random() * 80, 26, 1.4, "smoke", 0.32);
      burst(PX, PY - 40, 30, 300, ["green", "pale", "violet"], 0.8);
    });
    for (const [i, t] of [[8, 10.45], [9, 10.7], [10, 10.9], [11, 11.05], [12, 11.17], [13, 11.26]]) at("d" + i, t, () => snd("drum"));

    at("eject", T_EJECT, () => {
      snd("boom"); snd("whoosh");
      flash = reduced ? 0 : 0.55; shakeKick = 34 * rm;
      burst(PX, PY - 10, 90, 620, ["orange", "green", "pale", "violet"], 1.1);
      for (let i = 0; i < 22; i++) puff(PX + (Math.random() - 0.5) * 300, PY - 10, (Math.random() - 0.5) * 200, -140 - Math.random() * 160, 34, 1.6, "smoke", 0.34);
      rs.ejected = true;
    });
    // след за летящей душой
    if (rt > T_EJECT && rt < T_REVEAL) {
      const u = (rt - T_EJECT) / (T_REVEAL - T_EJECT), [wx, wy] = winnerPath(easeOut(u));
      for (let i = 0; i < 4; i++) spark(wx + (Math.random() - 0.5) * 18, wy + (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90 + 30, 0.7, 3 + Math.random() * 5, ["orange", "green", "pale"][(Math.random() * 3) | 0], { g: 60, drag: 1 });
    }
    at("reveal", T_REVEAL, () => {
      snd("win");
      flash = reduced ? 0 : 0.7;
      burst(WX, WY, 120, 760, ["orange", "green", "violet", "pale"], 0.1);
      for (let i = 0; i < 90; i++) spark(WX + (Math.random() - 0.5) * 1500, -20 - Math.random() * 300, (Math.random() - 0.5) * 80, 120 + Math.random() * 260, 3 + Math.random() * 3, 5 + Math.random() * 4, COLNAMES[(Math.random() * 3) | 0], { rect: 1, g: 40, drag: 0.1 });
      phase = "win";
      win = { t0: T, w: rs.winner, info: rs.info, fade: 0, ...(rs.sprites || buildWinnerSprites(rs.winner, rs.info)) };
    });
    if (rt >= T_END && !rs.done) { rs.done = true; const r = rs.resolve; rs = null; r?.(); }
  }
  let shakeKick = 0;

  function buildWinnerSprites(w, info) {
    const head = textSprite(tr("ПЕРЕМОЖЕЦЬ", "ПОБЕДИТЕЛЬ"), { size: 72, color: px.PAL.slime, drop: px.PAL.moss, ls: 6, depth: 6, pad: 16 });
    const pn = info?.prize?.name ? px.prizeLabel(info.prize.name) : "";
    const prize = pn ? textSprite(pn, { size: px.fit(tctx, pn, 40, 1500), color: px.PAL.amber, depth: 4, pad: 12 }) : null;
    const fs = px.fit(tctx, w.name, 150, 1560);
    const name = textSprite(w.name, { size: fs, color: px.PAL.bone, drop: px.PAL.rust, depth: 8, pad: 20 });
    const sub = [];
    if (w.handle) sub.push(w.handle);
    sub.push(`${tr("Квитки", "Билеты")}: ${w.tickets}`);
    const subS = textSprite(sub.join("  ·  "), { size: 44, color: px.PAL.slime, depth: 4, pad: 14 });
    return { head, prize, name, subS, col: colorFor(w), pic: px.prizePicture(info?.prize) };
  }

  function roll(winner, info) {
    if (rs) return Promise.resolve();
    phase = "roll";
    getImg(winner.avatar); // подгрузим заранее
    return new Promise((resolve) => {
      rs = { winner, info, t0: T, f: {}, resolve, done: false };
      root.dataset.winner = winner.id; lastWinnerId = winner.id;
    });
  }

  function reset() {
    if (rs) return;
    if (win) { win.fade = T; }
    if (lastWinnerId == null && win) lastWinnerId = win.w.id;
    if (lastWinnerId != null) {
      const s = byId.get(lastWinnerId);
      if (s) removeSoul(souls.indexOf(s));
      lastWinnerId = null;
    }
    phase = "idle"; speedMul = 1; boilTarget = 0.35; shakeAmp = 0;
    souls.forEach((s) => { if (s.mode === "in" || s.mode === "suck") { s.mode = "out"; s.wait = s.rnd() * 0.7; s.dur = 1.0 + s.rnd() * 0.3; } });
    rebuildLabels();
    total = souls.length; totalTickets = souls.reduce((a, s) => a + s.tk, 0);
    root.dataset.winner = "";
  }

  // ---------------------------------------------------------------- рисование
  const passList = [[], [], []];
  const embers = Array.from({ length: 110 }, (_, i) => ({ ph: Math.random(), a0: Math.random() * TAU, rate: 0.045 + Math.random() * 0.05, col: COLNAMES[i % 3], sz: 3 + Math.random() * 4, dir: Math.random() < 0.5 ? 1 : -1 }));
  const flies = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: 160 + Math.random() * 760, ph: Math.random() * TAU, sp: 0.2 + Math.random() * 0.5, col: COLNAMES[(Math.random() * 3) | 0] }));
  const bats = Array.from({ length: 3 }, (_, i) => ({ x: -200 - i * 700, y: 150 + i * 90, v: 95 + i * 25, ph: i * 2 }));
  const BAT_UP = ["..#.........#..", ".###.......###.", "#####.#.#.#####", "##.###########.##", "#...#######...#", "......###......"];
  const BAT_DN = ["......#.#......", "##...#####...##", "####.#####.####", ".#############.", "..###.###.###..", "...#...#...#..."];

  function drawSoulsPass(pass, clipY) {
    const list = passList[pass];
    if (clipY != null) { g.save(); g.beginPath(); g.rect(0, 0, W, clipY); g.clip(); }
    const many = souls.length > 400;
    // пыль: жёсткие квадраты-угольки
    for (const s of list) {
      if (s.labeled) continue;
      const a = s.alpha * (0.72 + 0.28 * Math.sin(T * 2.6 + s.ph));
      if (a <= 0.02) continue;
      const cs = COLS[s.col], size = Math.max(P, snap(s.r * 1.7 * s.sc));
      g.globalAlpha = steps(Math.min(1, a * 1.1), 5) || 0.2;
      if (!many && size >= 8) halo(g, s.x, s.y, size * 3.6, size * 3.6, cs.css, 0.8);
      g.fillStyle = cs.css; g.fillRect(snap(s.x) - size / 2, snap(s.y) - size / 2, size, size);
      if (size >= 8) { g.fillStyle = cs.light; g.fillRect(snap(s.x) - size / 2 + P, snap(s.y) - size / 2 + P, size - 2 * P, size - 2 * P); }
      if (s.trail && s.k > 0 && s.k < 1 && s.mode !== "orbit" && s.wait <= 0) {
        // хвост воронки
        g.globalAlpha = steps(a * 0.6, 4) || 0.25;
        sq(g, s.x - (s.x - PX) * 0.13, s.y - (s.y - PY) * 0.1 - 6, size * 0.7, cs.css);
      }
    }
    g.globalAlpha = 1;
    // именные души
    for (const s of list) {
      if (!s.labeled) continue;
      const a = s.alpha; if (a <= 0.02) continue;
      const pulse = 0.85 + 0.15 * Math.sin(T * 2.2 + s.ph);
      const gs = s.r * s.glowK * s.sc * pulse;
      g.globalAlpha = Math.min(1, a * 0.95);
      halo(g, s.x, s.y, gs, gs, COLS[s.col].css, 0.9);
      ensureBadge(s);
      const d = Math.max(P * 6, snap(s.badge.d * s.sc));
      g.globalAlpha = steps(Math.min(1, a * 1.15), 5) || 0.2;
      g.drawImage(s.badge.c, snap(s.x - d / 2), snap(s.y - d / 2), d, d);
      if (s.e < 0.35) {
        ensureLabel(s);
        const la = steps(a * (1 - s.e / 0.35) * (0.5 + 0.5 * (s.z + 1) / 2), 4);
        drawSprite(s.label, s.x, s.y + d / 2 + s.label.h / 2 - 4, la);
      }
    }
    g.globalAlpha = 1;
    if (clipY != null) g.restore();
  }

  function drawMascot() {
    if (!px.ready(heroImg)) return;
    const jump = phase === "win" ? -((Math.floor(T * 5) % 2) * 2) * P : 0;
    const bob = (Math.floor(T * (1.6 + boil * 2.6)) % 2) * P;
    const x0 = 24, y0 = 575 + bob + jump;   // слева: рука показывает на котёл
    g.imageSmoothingEnabled = false;
    g.drawImage(heroImg, x0, y0, 512, 512);
  }

  function drawBat(b) {
    const m = Math.floor(T * 7 + b.ph) % 2 ? BAT_UP : BAT_DN, y = snap(b.y + Math.sin(T * 1.7 + b.ph) * 26);
    g.fillStyle = "#3a1d5c";
    for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) if (m[j][i] === "#") g.fillRect(snap(b.x) + (i - 7) * P, y + j * P, P, P);
  }

  function drawPotLiquid(bl) {
    const cx = PX, cy = PY;
    // стоячее мерцание зелья: жёсткие светлые «пятна» по зеркалу
    g.save();
    g.beginPath(); g.rect(cx - LIQ.rx, cy - LIQ.ry, LIQ.rx * 2, LIQ.ry * 2); g.clip();
    const ph = Math.floor(T * (2 + bl * 6));
    g.fillStyle = COLS.green.light;
    for (let i = 0; i < 7; i++) {
      const a = (ph * 0.9 + i * 2.1) % TAU, u = Math.cos(a) * (0.25 + 0.5 * frac(i * 0.37)), v = Math.sin(a) * 0.5;
      g.globalAlpha = 0.15 + 0.4 * bl;
      g.fillRect(snap(cx + u * LIQ.rx), snap(cy + v * LIQ.ry), 3 * P, P);
    }
    g.globalAlpha = 1;
    // пузыри: пиксельные кольца
    for (const b of bubbles) {
      const p = b.age / b.life;
      const bx = cx + b.u * LIQ.rx * 0.82, by = cy + b.v * LIQ.ry * 0.62;
      if (p < 1) {
        const r = Math.max(2 * P, snap(b.r * (0.5 + p * 0.5) * 0.7));
        px.circle(g, bx, by - p * 4, r, COLS.pale.css, 1);
        g.fillStyle = "#ffffff"; g.fillRect(snap(bx) - r + P, snap(by) - r + P, P, P);
      } else {
        const q = (b.age - b.life) / 0.25;
        if (q < 0.7) { g.globalAlpha = 0.6; px.circle(g, bx, by, snap(b.r * (0.7 + q * 1.4)), COLS.green.light, 1); g.globalAlpha = 1; }
      }
    }
    g.restore();
    // кромка зеркала: ступенчатый ободок
    g.globalAlpha = steps(0.25 + 0.5 * bl, 4);
    g.fillStyle = COLS.green.css;
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; g.fillRect(snap(cx + Math.cos(a) * (LIQ.rx + 4)), snap(cy + Math.sin(a) * (LIQ.ry + 2)), P, P); }
    g.globalAlpha = 1;
  }

  /** Портрет победителя: рамка box() и пиксельная аватарка. */
  function drawPortrait(cx, cy, size, w, col, a) {
    const A = Math.max(16, snap(size, 2 * P)), fr = A + 4 * P;
    g.globalAlpha = a;
    px.box(g, cx - fr / 2, cy - fr / 2, fr, fr, { frame: COLS[col].css, fill: px.PAL.plum, bevel: false });
    avatar(g, cx - A / 2, cy - A / 2, A, w.name, col, getImg(w.avatar), 8, false);
    g.globalAlpha = 1;
  }

  function drawWinner(wn) {
    const age = T - wn.t0;
    const fadeA = wn.fade ? 1 - clamp((T - wn.fade) / 0.45) : 1;
    if (fadeA <= 0) { win = null; return; }
    const w = wn.w;
    // лучи: на lowres-слое, края — жёсткие пиксели
    const rg = rays.begin();
    rg.translate(WX, WY); rg.rotate(Math.floor(T * 6) / 6 * 0.2);
    for (let i = 0; i < 12; i++) {
      rg.save(); rg.rotate((i / 12) * TAU);
      rg.fillStyle = i % 2 ? "rgba(255,177,92,.55)" : "rgba(255,102,0,.55)";
      rg.beginPath(); rg.moveTo(0, 0); rg.lineTo(1500, -80 - (i % 2) * 40); rg.lineTo(1500, 80 + (i % 2) * 40); rg.closePath(); rg.fill();
      rg.restore();
    }
    g.globalAlpha = steps(smooth(age / 0.8) * fadeA * (reduced ? 0.12 : 0.2), 8);
    rays.blit(g);
    g.globalAlpha = 1;
    // кольца-ударные волны (пиксельные окружности)
    for (const [d0, c] of [[0, px.PAL.amber], [0.18, px.PAL.slime]]) {
      const q = (age - d0) / 1.1;
      if (q > 0 && q < 1) { g.globalAlpha = steps((1 - q) * fadeA, 3) || 0.3; px.circle(g, WX, WY, 150 + 800 * easeOut(q), c, q < 0.5 ? 3 : 2); g.globalAlpha = 1; }
    }
    // «души-спутники»
    for (let i = 0; i < 16; i++) {
      const a = T * (0.5 + (i % 3) * 0.1) + (i / 16) * TAU, r = 215 + (i % 2) * 38 + Math.sin(T * 1.2 + i) * 8;
      const x = WX + Math.cos(a) * r * 1.25, y = WY + Math.sin(a) * r * 0.82, sz = (8 + (i % 3) * 4) * smooth(age / 1.2);
      const cs = COLS[COLNAMES[i % 3]];
      g.globalAlpha = fadeA; halo(g, x, y, sz * 5, sz * 5, cs.css, 0.7);
      sq(g, x, y, sz, cs.css); if (sz >= 12) sq(g, x, y, sz - 8, cs.light);
    }
    g.globalAlpha = 1;
    // портрет в рамке
    const open = smooth(age / 0.45), pulse = Math.floor(T * 2) % 2 ? P : 0;
    drawPortrait(WX, WY, 256 * lerp(0.4, 1, open), w, wn.col, steps(smooth(age / 0.25) * fadeA, 4) || 0.25);
    // выигранный приз — справа от портрета, за кольцом душ
    if (wn.pic) {
      const [pw, ph] = px.prizePictureSize(wn.pic, 360), pa = steps(smooth((age - 0.6) / 0.4) * fadeA, 4);
      if (pa > 0) { g.globalAlpha = pa; px.prizeFrame(g, wn.pic, snap(1530 - pw / 2), snap(WY - ph / 2 - (1 - pa) * 24), pw, ph); g.globalAlpha = 1; }
    }
    // тексты
    const hA = steps(smooth((age - 0.1) / 0.5) * fadeA, 4), hy = snap(110 - (1 - easeOut((age - 0.1) / 0.6)) * 40);
    drawSprite(wn.head, WX, hy, hA);
    // табличка с именем: открывается от центра, имя крупно
    const PH = wn.prize ? 300 : 250, q = smooth((age - 0.3) / 0.5), ph = snap(PH * q), pw = snap(Math.max(780, Math.min(1760, wn.name.tw + 160)), 8);
    if (ph >= 16) {
      g.globalAlpha = fadeA;
      px.box(g, WX - pw / 2, (wn.prize ? 620 : 595) - ph / 2, pw, ph, { frame: pulse ? px.PAL.orange : px.PAL.amber, fill: px.PAL.plum });
      g.globalAlpha = 1;
      if (q > 0.85) {
        drawSprite(wn.name, WX, wn.prize ? 575 : 570, fadeA);
        const la = steps(smooth((age - 0.8) / 0.4) * fadeA, 4);
        drawSprite(wn.subS, WX, wn.prize ? 654 : 656, la);
        if (wn.prize) drawSprite(wn.prize, WX, 712, la);
      }
    }
  }

  function drawHud() {
    if (phase !== "idle") return;
    const t = textSprite(`${tr("Учасників", "Участников")} ${total} · ${tr("Квитків", "Билетов")} ${totalTickets}`, { size: 28, color: px.PAL.bone, depth: P, pad: 8 });
    const bw = snap(t.tw + 32, P);
    px.box(g, 48, 40, bw, 56, { frame: px.PAL.orange, fill: px.PAL.plum });
    drawSprite(t, 48 + 16 + t.w / 2 - 8, 68, 1);
  }

  function caption(rt) {
    for (const [t0, t1, tx] of CAPTIONS) {
      if (rt >= t0 && rt < t1) {
        const a = steps(smooth((rt - t0) / 0.3) * (1 - smooth((rt - (t1 - 0.25)) / 0.25)), 4);
        const s = textSprite(tx, { size: 60, color: px.PAL.bone, drop: px.PAL.moss, depth: 6, pad: 16 });
        drawSprite(s, WX, snap(90 + (1 - a) * 12), a);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- кадр
  function update(dt) {
    if (rs) stepRoll(dt);
    boil += (boilTarget - boil) * Math.min(1, dt * 3.5);
    gulp = Math.max(0, gulp - dt * 1.6);
    shakeKick = Math.max(0, shakeKick - dt * 80);
    flash = Math.max(0, flash - dt * 1.7);

    passList[0].length = 0; passList[1].length = 0; passList[2].length = 0;
    let entered = 0;
    for (let i = souls.length - 1; i >= 0; i--) {
      const s = souls[i];
      if (s.dying && T - s.dying > 0.75) { removeSoul(i); continue; }
      if (stepSoul(s, dt)) {
        entered++;
        if (s.labeled || Math.random() < 0.06) {
          spark(PX + (Math.random() - 0.5) * 120, PY - 4, (Math.random() - 0.5) * 140, -160 - Math.random() * 120, 0.6, 3 + Math.random() * 3, s.col, { g: 520, drag: 0.5 });
        }
      }
      if (s.mode !== "in" && s.alpha > 0.005) passList[s.pass].push(s);
    }
    gulp = Math.min(1, gulp + entered * (souls.length > 400 ? 0.004 : 0.03));
    if (entered && !reduced && phase === "roll") shakeKick = Math.max(shakeKick, 4);

    // пузыри на зелье
    const bl = clamp(boil + gulp * 0.35);
    if (Math.random() < dt * (2 + 26 * bl)) bubbles.push({ u: (Math.random() - 0.5) * 2, v: (Math.random() - 0.5) * 2, r: 7 + Math.random() * 14 + bl * 6, age: 0, life: 0.5 + Math.random() * 0.8 });
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.age += dt;
      if (!b.popped && b.age >= b.life) { b.popped = true; if (bl > 0.5 && Math.random() < 0.4) spark(PX + b.u * 200, PY + b.v * 30, (Math.random() - 0.5) * 60, -90 - Math.random() * 80, 0.5, 2 + Math.random() * 2, "green", { g: 400 }); }
      if (b.age > b.life + 0.25) bubbles.splice(i, 1);
    }
    // пар
    if (Math.random() < dt * (4 + 34 * bl) && puffs.length < 120) puff(PX + (Math.random() - 0.5) * 380, PY - 6 + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 24, -50 - Math.random() * 60 - bl * 50, 26 + Math.random() * 24, 2.6 + Math.random() * 1.6, Math.random() < 0.3 ? "violet" : "smoke", 0.12 + bl * 0.1);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.life -= dt; if (p.life <= 0) { puffs.splice(i, 1); continue; }
      p.x += p.vx * dt + Math.sin(T * 1.3 + i) * 10 * dt; p.y += p.vy * dt; p.r += p.gr * dt; p.vx *= 1 - dt * 0.4;
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy += s.g * dt; const dr = 1 - Math.min(1, s.drag * dt); s.vx *= dr; s.vy *= dr; s.x += s.vx * dt; s.y += s.vy * dt;
    }
    if (phase === "win" && Math.random() < dt * (reduced ? 6 : 22) && sparks.length < 500) {
      spark(Math.random() * W, -10, (Math.random() - 0.5) * 60, 110 + Math.random() * 180, 6, 5 + Math.random() * 4, COLNAMES[(Math.random() * 3) | 0], { rect: 1 });
    }
    for (const b of bats) { b.x += b.v * dt; if (b.x > W + 200) { b.x = -300; b.y = 150 + Math.random() * 280; } }
  }

  function render() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#0e0e10"; g.fillRect(0, 0, cw, ch);
    g.setTransform(fit, 0, 0, fit, ox, oy);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (px.ready(bgImg)) g.drawImage(bgImg, 0, 0, W, H);
    else { g.fillStyle = px.PAL.plum; g.fillRect(0, 0, W, H); }

    const bl = clamp(boil + gulp * 0.35);
    // светляки: мигающие квадраты
    for (const f of flies) {
      const x = f.x + Math.sin(T * f.sp + f.ph) * 40, y = f.y + Math.cos(T * f.sp * 0.8 + f.ph) * 30;
      if (Math.floor(T * 2 + f.ph * 3) % 3 === 0) continue;
      g.globalAlpha = 0.7; sq(g, x, y, P, COLS[f.col].light);
    }
    g.globalAlpha = 1;
    for (const b of bats) drawBat(b);

    drawSoulsPass(0);
    drawMascot();

    // котёл: тряска шагами по сетке
    const amp = shakeAmp + shakeKick;
    const sx = amp ? snap((Math.random() - 0.5) * 2 * amp * 0.6) : 0, sy = amp ? snap((Math.random() - 0.5) * amp * 0.4) : 0;
    // отсвет огня на земле
    halo(g, PX, 1010, 900, 240, px.PAL.orange, 0.5 + 0.3 * bl);
    g.save(); g.translate(sx, sy);
    if (px.ready(potImg)) g.drawImage(potImg, POT_X, POT_Y, 384 * POT_S, 384 * POT_S);
    drawPotLiquid(bl);
    drawSoulsPass(1, PY + 4);
    g.restore();
    // зелёная лужа света над котлом: растёт от кипения
    halo(g, PX, PY - 40, 1100, 460, px.PAL.slime, 0.35 + 0.55 * bl);

    // вихрь углей из котла
    const eInt = 0.25 + 0.75 * bl;
    for (const m of embers) {
      const h = frac(T * m.rate * (1 + bl * 1.5) + m.ph);
      const R = 30 + 250 * Math.pow(h, 0.85), a = m.a0 + m.dir * T * (1.4 - h * 0.6);
      const x = PX + Math.cos(a) * R, y = PY - 30 - 520 * h + Math.sin(a) * R * 0.2;
      const al = Math.sin(Math.PI * h) * eInt * (phase === "win" ? 0.7 : 0.9);
      if (al < 0.08) continue;
      g.globalAlpha = steps(al, 3) || 0.33;
      sq(g, x, y, m.sz * (1.7 - h) * 1.6, COLS[m.col].css);
    }
    g.globalAlpha = 1;

    // пар: дизерные облачка
    for (const p of puffs) {
      const q = p.life / p.max, a = p.a * Math.sin(Math.PI * Math.min(1, (1 - q) * 1.15)) * (0.35 + 0.65 * q);
      halo(g, p.x, p.y, p.r * 2.2, p.r * 2.2, PUFF_COL[p.kind] || PUFF_COL.smoke, Math.min(1, a * 3));
    }

    drawSoulsPass(2);

    // ложный выброс: безымянный огонёк «пшик»
    if (rs) {
      const rt = T - rs.t0;
      if (rt >= T_F1 - 0.05 && rt < T_F1 + 0.55) {
        const q = (rt - T_F1 + 0.05) / 0.6, y = PY - 12 - Math.sin(q * Math.PI) * 120, a = 1 - q * q;
        g.globalAlpha = steps(a, 3) || 0.33;
        halo(g, PX, y, 120, 120, COLS.pale.css, 0.9); sq(g, PX, y, 24 * (1 - q * 0.4), COLS.pale.light);
        g.globalAlpha = 1;
      }
      if (rt >= T_F2 && rt < T_F2_END) {
        const q = (rt - T_F2) / (T_F2_END - T_F2);
        const rise = q < 0.5 ? easeOut(q / 0.5) : q < 0.75 ? 1 : 1 - smooth((q - 0.75) / 0.25);
        const y = PY - 12 - rise * 230, x = PX + Math.sin(T * 26) * 5 * (q > 0.5 && q < 0.75 ? 1 : 0.2);
        const flick = q > 0.5 ? (Math.floor(T * 14) % 2 ? 1 : 0.45) : 1;
        const sz = 150 * (0.6 + 0.4 * rise);
        g.globalAlpha = flick;
        halo(g, x, y, sz * 2.2, sz * 2.2, COLS.green.css, 0.8);
        halo(g, x, y, sz, sz, COLS.pale.css, 0.9);
        sq(g, x, y, sz * 0.28, COLS.pale.light);
        g.globalAlpha = 1;
        if (Math.random() < 0.5) spark(x, y, (Math.random() - 0.5) * 80, 30 + Math.random() * 60, 0.5, 3, "green", { g: 300 });
      }
      // душа победителя: вылет из котла
      if (rt >= T_EJECT && rt < T_REVEAL) {
        const u = (rt - T_EJECT) / (T_REVEAL - T_EJECT), e = easeOut(u), [wx, wy] = winnerPath(e);
        const col = colorFor(rs.winner), r = lerp(16, 112, e * e), sz = r * 3.6;
        halo(g, wx, wy, sz * 1.6, sz * 1.6, COLS[col].css, 0.95);
        halo(g, wx, wy, sz * 0.7, sz * 0.7, COLS.pale.css, 0.9);
        const da = smooth((u - 0.55) / 0.45);
        if (da > 0.01) {
          const A = Math.max(16, snap(r * 1.8));
          g.globalAlpha = steps(da, 3) || 0.33;
          avatar(g, wx - A / 2, wy - A / 2, A, rs.winner.name, col, getImg(rs.winner.avatar), 8);
          g.globalAlpha = 1;
        } else sq(g, wx, wy, r * 0.5, COLS.pale.light);
      }
    }

    if (win) drawWinner(win);

    // искры и конфетти: квадраты, под конец мигают и уходят
    for (const s of sparks) {
      const q = s.life / s.max;
      if (q < 0.12 || (q < 0.3 && Math.floor(T * 20 + s.x) % 2)) continue;
      sq(g, s.x, s.y, s.rect ? s.size * 1.4 : s.size * 1.2, COLS[s.col].css);
    }

    // вспышка: полная заливка жёсткими ступенями
    if (flash > 0.04) { g.globalAlpha = steps(flash, 4) * 0.8; g.fillStyle = px.PAL.bone; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }

    if (rs) caption(T - rs.t0);
    drawHud();
  }

  let fpsN = 0, fpsT = 0;
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    fpsN++; fpsT += dt; if (fpsT >= 1) { root.dataset.fps = String(Math.round(fpsN / fpsT)); fpsN = 0; fpsT = 0; }
    update(dt);
    render();
  }

  // ---------------------------------------------------------------- запуск
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(root);
  raf = requestAnimationFrame(frame);
  root.dataset.visual = "cauldron";
  px.ensureFont().then(() => { spriteCache.clear(); souls.forEach((s) => { s.badge = null; s.label = null; }); });

  return {
    setParticipants,
    roll,
    reset,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); ro.disconnect();
      if (rs) { const r = rs.resolve; rs = null; r?.(); }
      root.innerHTML = "";
    },
  };
}
