// «Цвинтар» — draw screen visual for the Halloween stream. See ../../VISUAL-CONTRACT.md.
// Participants are tombstones in perspective rows; a mascot-ghost flies over them with a lantern,
// the camera follows, false landing, the winner's stone cracks and a hand rises with a sign.
// 16-bit pixel-art skin: the whole world is drawn into a 480x270 layer (art pixel = 4 screen px at 1080p) and
// blitted nearest-neighbour; the winner's sign text, the name tags and the DOM UI are drawn crisp on top.
import * as A from "./art.js";
import * as px from "../pixel-kit.js";

export const meta = { id: "graveyard", title: "Цвинтар", author: "agent" };

const VH = 1080, HY = Math.round(VH * 0.36), G = Math.round(VH * 0.46); // horizon y and ground span (front row stands at HY+G)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeBack = (t) => { t = clamp(t, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const snap4 = (v) => Math.round(v / 4) * 4;
const TIER_M = [1, 1.1, 1.22, 1.38];
const TIMES = { intro: 1.3, sweepEnd: 8.3, fakeEnd: 9.8, hopEnd: 10.6, crack: 10.5, split: 11.6, hand: 11.75, banner: 11.85, win: 12.1, end: 13.3 };
const STARS = [[1288, 78], [830, 198], [1527, 56], [1411, 50], [533, 357], [1577, 356], [1162, 168], [495, 325], [706, 171], [1422, 222]];

// Pixel frame of stage.css (.px): hard box-shadows, no radius, no blur. --p is one art pixel.
const cssFor = () => `
.gy-cv{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated}
.gy-ui{position:absolute;inset:0;pointer-events:none;font-family:${px.fontFamily()};color:#f4f1ea;--p:calc(var(--u)*4px);--ink:#0e0e10}
.gy-px{background:#1a0f24;--fr:#ff6600;box-shadow:inset var(--p) var(--p) 0 0 #ffffff1f,inset calc(-1*var(--p)) calc(-1*var(--p)) 0 0 #00000066,
  calc(-1*var(--p)) 0 0 0 var(--fr),var(--p) 0 0 0 var(--fr),0 calc(-1*var(--p)) 0 0 var(--fr),0 var(--p) 0 0 var(--fr),
  calc(-2*var(--p)) 0 0 0 var(--ink),calc(2*var(--p)) 0 0 0 var(--ink),0 calc(-2*var(--p)) 0 0 var(--ink),0 calc(2*var(--p)) 0 0 var(--ink),
  calc(-1*var(--p)) calc(-1*var(--p)) 0 0 var(--ink),var(--p) calc(-1*var(--p)) 0 0 var(--ink),calc(-1*var(--p)) var(--p) 0 0 var(--ink),var(--p) var(--p) 0 0 var(--ink),
  0 calc(4*var(--p)) 0 0 #00000080}
.gy-stat{position:absolute;left:calc(var(--u)*36px);top:calc(var(--u)*36px);padding:calc(var(--u)*10px) calc(var(--u)*22px);font-weight:700;font-size:calc(var(--u)*24px);
  white-space:nowrap;text-shadow:var(--p) var(--p) 0 var(--ink)}
.gy-stat b{color:#ffb15c;font-weight:700}
.gy-banner{position:absolute;left:0;right:0;top:calc(var(--u)*100px);text-align:center;opacity:0}
.gy-banner.on{animation:gy-pop .7s steps(7) both}
@keyframes gy-pop{from{opacity:0;transform:translateY(calc(var(--u)*-60px))}to{opacity:1;transform:none}}
.gy-banner .t{font-weight:700;font-size:calc(var(--u)*112px);line-height:1;letter-spacing:.06em;color:#fff3c4;
  text-shadow:calc(var(--u)*6px) calc(var(--u)*6px) 0 var(--ink),calc(var(--u)*12px) calc(var(--u)*12px) 0 #5a2200}
.gy-banner .r{display:inline-block;margin-top:calc(var(--u)*22px);padding:calc(var(--u)*8px) calc(var(--u)*32px);background:#ff6600;--fr:#ffb15c;color:#170800;
  font-weight:700;font-size:calc(var(--u)*38px);letter-spacing:.04em}
.gy-ticker{position:absolute;left:0;right:0;bottom:calc(var(--u)*52px);text-align:center;opacity:0;transform:translateY(calc(var(--u)*16px));transition:opacity .35s steps(4),transform .35s steps(4)}
.gy-ticker.on{opacity:1;transform:none}
.gy-ticker .box{--fr:#7cff4f;display:inline-flex;align-items:baseline;gap:calc(var(--u)*20px);padding:calc(var(--u)*12px) calc(var(--u)*36px) calc(var(--u)*14px)}
.gy-ticker .l{font-weight:700;font-size:calc(var(--u)*24px);color:#7cff4f;text-transform:uppercase;letter-spacing:.12em;text-shadow:var(--p) var(--p) 0 var(--ink)}
.gy-ticker .n{font-weight:700;font-size:calc(var(--u)*60px);color:#fff;min-width:calc(var(--u)*320px);text-shadow:calc(var(--u)*4px) calc(var(--u)*4px) 0 var(--ink),calc(var(--u)*8px) calc(var(--u)*8px) 0 #3a1500}
`;

const imgs = {};
function loadImg(name) {
  const i = new Image(); i.decoding = "async";
  i.src = new URL(`../../assets/sprites/${name}.png`, import.meta.url).href;
  imgs[name] = i; return i;
}
const plural = px.ticketsWord;

export function mount(root, ctx) {
  const reduced = !!ctx.reducedMotion;
  const snd = (n) => { try { ctx.sound?.(n); } catch { /* sound is optional */ } };
  root.style.cssText += ";position:absolute;inset:0;overflow:hidden;background:#07060a";
  const style = document.createElement("style"); style.textContent = cssFor(); root.append(style);
  const canvas = document.createElement("canvas"); canvas.className = "gy-cv"; root.append(canvas);
  const mg = canvas.getContext("2d", { alpha: false }); // the visible canvas
  let g = mg; // current drawing target: the low-res world layer while the world is drawn, else mg
  let L = null; // low-res layer
  const ui = document.createElement("div"); ui.className = "gy-ui";
  ui.innerHTML = `<div class="gy-stat gy-px"></div><div class="gy-banner"><div class="t">ПЕРЕМОЖЕЦЬ</div><div class="r gy-px"></div></div><div class="gy-ticker"><div class="box gy-px"><span class="l">Учасник</span><b class="n"></b></div></div>`;
  root.append(ui);
  const $stat = ui.querySelector(".gy-stat"), $banner = ui.querySelector(".gy-banner"), $round = ui.querySelector(".gy-banner .r");
  const $ticker = ui.querySelector(".gy-ticker"), $tname = ui.querySelector(".gy-ticker .n");

  const heroWave = loadImg("hero_wave"), heroBlink = loadImg("hero_blink");
  const bgImg = px.loadImage(px.sceneUrl("bg-night"));

  const V = { W: 1920, s: 1, dpr: 1 };
  let ready = false, destroyed = false, raf = 0, T = 0, last = 0;
  let B = null; // baked art
  const tags = [], signRef = { v: null }; // overlay work collected during the world pass

  // ------------------------------------------------------------------ state
  let parts = [];
  let stones = [], drawList = [], LY = { R: 0, D: 0, a: 0.6, ws: 200, Wu: 1800, Zgate: 5 };
  const grid = new Map(), GC = 48;
  const wonSet = new Set(), justWon = new Set();
  let firstLayout = true;
  const cam = { Xf: 0, Zf: 1, lk: 0, yb: HY + G, cx: 0, zc: 0, camH: G, kf: 1, shx: 0, shy: 0 };
  const parts_fx = []; // screen-space particles
  const trail = []; // ghost trail (world space)
  const gh = { on: false, xo: 0, yo: 0, alt: 0, a: 0, lean: 0, vx: 0, spd: 0, blink: 0, nextBlink: 2 };
  const wisps = [];
  let R0 = null; // current roll
  let fin = null; // finale (sign) state
  let lightning = 0, nextLightning = 12;
  let warm = [], frameNo = 0, tickT = -9, tickerId = null;

  const isWon = (s) => !!s.p && (wonSet.has(s.id) || justWon.has(s.id) || s.p.won);

  // ------------------------------------------------------------------ layout
  function relayout() {
    const W = V.W, n = parts.length;
    const old = new Map(stones.map((s) => [s.id, s]));
    const next = [];
    let R = 1, a = 0.6;
    if (n > 10) {
      const cand = []; let best = 0;
      for (let r = 1; r <= Math.min(18, Math.ceil(n / 2)); r++) {
        const aa = r >= 3 ? Math.min(0.6, 3.5 / (r - 1)) : 0.6;
        let sum = 0; for (let i = 0; i < r; i++) sum += 1 + aa * i;
        const c0 = n / sum, Wu = Math.min(0.94 * W, 400 * c0), wsT = Math.min(0.78 * (Wu / c0), 230);
        let worst = 0;
        for (let i = 0; i < r; i++) { const Z = 1 + aa * i, Z2 = 1 + aa * (i + 1); worst = Math.max(worst, (wsT * 1.3 / Z) / (G * (1 / Z - 1 / Z2))); }
        cand.push({ r, aa, worst, ws: wsT });
      }
      const ok = cand.filter((c) => c.worst <= 1.15);
      const pick = ok.length ? ok.reduce((m, c) => (c.ws > m.ws ? c : m)) : cand.reduce((m, c) => (c.worst < m.worst ? c : m));
      R = pick.r; a = pick.aa;
    }
    const Zs = []; for (let i = 0; i < R; i++) Zs.push(1 + a * i);
    const sum = Zs.reduce((x, y) => x + y, 0);
    const counts = Zs.map((z) => Math.floor((n * z) / sum));
    let rest = n - counts.reduce((x, y) => x + y, 0);
    const order = Zs.map((z, i) => [((n * z) / sum) % 1, i]).sort((p, q) => q[0] - p[0]);
    for (let i = 0; rest > 0; i = (i + 1) % R) { counts[order[i % R][1]]++; rest--; }
    const c0 = Math.max(1, counts[0] || 1);
    const Wu = n ? Math.min(0.94 * W, 400 * c0) : 0.94 * W;
    const ws = n ? Math.min(0.78 * (Wu / c0), 230) : 200;
    const D = n > 60 ? 0 : R === 1 ? 4 : R === 2 ? 3 : R === 3 ? 2 : 1;
    LY = { R, D, a, ws, Wu, Zgate: 1 + a * (R + D) + 0.9 };

    const sorted = parts.slice().sort((x, y) => y.tickets - x.tickets || A.hash(x.id) - A.hash(y.id));
    const rows = [];
    let idx = 0;
    const spawnDelay = (i) => (firstLayout ? 0.2 + Math.random() * 1.3 + (i / Math.max(1, n)) * 0.4 : Math.random() * 0.5);
    for (let r = 0; r < R + D; r++) {
      const Z = 1 + a * r, row = { z: Z, stones: [], col: "" };
      rows.push(row);
      const width = Wu * Z;
      if (r < R) {
        const part = sorted.slice(idx, idx + counts[r]); idx += counts[r];
        part.sort((x, y) => A.hash(x.id + "p") - A.hash(y.id + "p"));
        const step = width / Math.max(1, part.length);
        part.forEach((p, i) => {
          const rr = A.rng(A.hash(p.id));
          const tier = clamp(p.tickets | 0, 1, 4), jx = (rr() - 0.5) * 0.3 * step, jz = (rr() - 0.5) * 0.28 * a * (R === 1 ? 0.2 : 1);
          let s = old.get(p.id);
          const tx = -width / 2 + (i + 0.5) * step + jx, tz = Z + jz;
          if (!s) { s = { id: p.id, x: tx, z: tz, born: T + spawnDelay(i), light: 0, tgt: 0, stamp: 0, inW: false, ph: rr() * 10, fade: 1, av: null, nameU: 0, wob: 0 }; }
          Object.assign(s, { p, decor: false, tier, v: rr() < 0.5 ? 0 : 1, tx, tz, sw: ws * TIER_M[tier - 1], tilt: (rr() - 0.5) * 0.09 * (tier === 4 ? 0.4 : 1), row: r });
          row.stones.push(s); next.push(s);
        });
      } else {
        const cnt = clamp(Math.floor(width / (ws * 1.35)), 3, 90), step = width / cnt;
        for (let i = 0; i < cnt; i++) {
          const id = `d${r}_${i}`, rr = A.rng(A.hash(id));
          const tier = rr() < 0.65 ? 1 : 2, m = 0.78 + rr() * 0.28;
          const tx = -width / 2 + (i + 0.5) * step + (rr() - 0.5) * 0.5 * step, tz = Z + (rr() - 0.5) * 0.3 * a;
          let s = old.get(id);
          if (!s) s = { id, x: tx, z: tz, born: T - 5, light: 0, tgt: 0, stamp: 0, inW: false, ph: rr() * 10, fade: 1, av: null, nameU: 0, wob: 0 };
          Object.assign(s, { p: null, decor: true, tier, v: rr() < 0.5 ? 0 : 1, tx, tz, sw: ws * m * TIER_M[tier - 1], tilt: (rr() - 0.5) * 0.14, row: r });
          row.stones.push(s); next.push(s);
        }
      }
      const dep = clamp((Z - 1) / 4.5, 0, 1);
      row.col = `rgb(${Math.round(lerp(104, 66, dep))},${Math.round(lerp(98, 56, dep))},${Math.round(lerp(138, 100, dep))})`;
      row.stones.sort((p, q) => q.tz - p.tz);
    }
    stones = next; firstLayout = false;
    drawList = [];
    const Rt = R + D;
    drawList.push({ fog: true, z: rows[Rt - 1].z + a * 0.55, i: 0, a: 0.5 });
    for (let r = Rt - 1; r >= 0; r--) {
      drawList.push({ row: rows[r] });
      if ((Rt - 1 - r) % 2 === 1 || r === 0) drawList.push({ fog: true, z: rows[r].z - a * 0.42, i: r + 1, a: 0.42 });
    }
    // spatial grid (overview plane) for lantern lighting
    grid.clear();
    for (const s of stones) {
      s.xo = W / 2 + s.tx / s.tz; s.yo = HY + G / s.tz;
      const key = ((s.xo / GC) | 0) * 8192 + ((s.yo / GC) | 0);
      let b = grid.get(key); if (!b) grid.set(key, (b = [])); b.push(s);
    }
    updateStat();
    makeWisps();
  }

  function updateStat() {
    const pool = parts.filter((p) => !(wonSet.has(p.id) || justWon.has(p.id) || p.won));
    const tickets = pool.reduce((s, p) => s + p.tickets, 0);
    $stat.innerHTML = `Учасники <b>${pool.length}</b> &nbsp;·&nbsp; Квитки <b>${tickets}</b>`;
  }

  /** Light every stone near an overview-plane point; returns nearest participant stone. */
  function lightAt(xo, yo, Ro, strength) {
    let best = null, bd = 1e9;
    const x0 = ((xo - Ro) / GC) | 0, x1 = ((xo + Ro) / GC) | 0, y0 = ((yo - Ro / 1.8) / GC) | 0, y1 = ((yo + Ro / 1.8) / GC) | 0;
    for (let cx = Math.max(0, x0); cx <= x1; cx++) for (let cy = Math.max(0, y0); cy <= y1; cy++) {
      const b = grid.get(cx * 8192 + cy); if (!b) continue;
      for (const s of b) {
        const dx = s.xo - xo, dy = (s.yo - yo) * 1.8, d = Math.sqrt(dx * dx + dy * dy);
        if (d > Ro) continue;
        const v = (1 - sstep(Ro * 0.4, Ro, d)) * strength;
        if (s.stamp !== frameNo) { s.stamp = frameNo; s.tgt = v; } else if (v > s.tgt) s.tgt = v;
        if (!s.inW) { s.inW = true; warm.push(s); }
        if (!s.decor && !isWon(s) && d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ wisps (idle life)
  function makeWisps() {
    wisps.length = 0;
    const n = parts.length >= 300 ? 3 : parts.length >= 5 ? 2 : 1;
    for (let i = 0; i < n; i++) wisps.push({ xo: V.W * (0.25 + 0.5 * Math.random()), yo: HY + G * 0.6, tgt: null, dwell: 1 + i * 1.3, tag: 0, ph: Math.random() * 9 });
  }
  function updateWisps(dt) {
    const cand = stones.filter((s) => !s.decor && !isWon(s));
    for (const w of wisps) {
      if (!w.tgt || !cand.includes(w.tgt) && Math.random() < 0.05) w.tgt = cand.length ? cand[(Math.random() * cand.length) | 0] : null;
      if (!w.tgt) continue;
      const tx = w.tgt.xo, ty = w.tgt.yo;
      const dx = tx - w.xo, dy = ty - w.yo, d = Math.hypot(dx, dy);
      if (d > 14) { const sp = Math.min(d * 1.6, 260 + (LY.ws / 1.0)) * dt; w.xo += (dx / d) * Math.min(sp, d); w.yo += (dy / d) * Math.min(sp, d); w.dwell = 2.4 + Math.random() * 1.6; w.tag = Math.max(0, w.tag - dt * 3); }
      else { w.dwell -= dt; w.tag = Math.min(1, w.tag + dt * 3); if (w.dwell <= 0) w.tgt = cand.length ? cand[(Math.random() * cand.length) | 0] : null; }
      const Z = G / Math.max(1, w.yo - HY);
      lightAt(w.xo, w.yo, 1.7 * LY.ws / Z + 16, 0.78 * (0.5 + 0.5 * w.tag));
    }
  }

  // ------------------------------------------------------------------ camera
  function camStep(dt, tgt, rate, zrate) {
    const k = 1 - Math.exp(-rate * dt), kz = 1 - Math.exp(-zrate * dt);
    cam.Xf += (tgt.Xf - cam.Xf) * (tgt.xr ? 1 - Math.exp(-tgt.xr * dt) : k); cam.Zf += (tgt.Zf - cam.Zf) * k; cam.yb += (tgt.yb - cam.yb) * k; cam.lk += (tgt.lk - cam.lk) * kz;
  }
  function camCompute(idle) {
    const kf = Math.exp(cam.lk);
    cam.kf = kf; cam.zc = cam.Zf - 1 / kf; cam.camH = (cam.yb - HY) / kf;
    cam.cx = cam.Xf + (idle ? Math.sin(T * 0.11) * V.W * 0.012 * cam.Zf : 0);
  }
  const idleTarget = () => ({ Xf: 0, Zf: 1, lk: 0, yb: HY + G });
  const kClose = () => clamp(135 / LY.ws, 1, 6);

  // ------------------------------------------------------------------ particles
  function puff(x, y, n, o = {}) {
    for (let i = 0; i < n && parts_fx.length < 420; i++) {
      const a = (o.dir ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? 2.6), sp = (o.sp ?? 160) * (0.4 + Math.random());
      parts_fx.push({ x: x + (Math.random() - 0.5) * (o.w ?? 0), y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: o.ay ?? 60, life: 0, max: (o.life ?? 1.1) * (0.6 + Math.random() * 0.7), r: (o.r ?? 5) * (0.5 + Math.random()), col: o.col ?? "180,170,190", add: !!o.add });
    }
  }

  // ------------------------------------------------------------------ roll
  function catmull(pts) {
    const out = [], n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
      for (let j = 0; j < 36; j++) {
        const t = j / 36, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(pts[n - 1]);
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, cum, L: cum[cum.length - 1] };
  }
  function pathAt(P, s) {
    s = clamp(s, 0, P.L); let lo = 0, hi = P.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] < s) lo = m; else hi = m; }
    const f = (s - P.cum[lo]) / Math.max(1e-6, P.cum[hi] - P.cum[lo]);
    return [lerp(P.pts[lo][0], P.pts[hi][0], f), lerp(P.pts[lo][1], P.pts[hi][1], f)];
  }

  function stoneH(s) { return (s.sw * A.TIER_H[s.tier - 1]) / 240; }

  function startRoll(winner, info) {
    if (R0) return R0.promise;
    let W = stones.find((s) => s.p && s.p.id === winner.id);
    if (!W) { parts = parts.concat([winner]); relayout(); W = stones.find((s) => s.p && s.p.id === winner.id); }
    if (!W) return Promise.resolve();
    W.p = { ...W.p, ...winner };
    if (winner.avatar && ctx.privacy?.avatars !== false) requestAvatar(W, true);
    const W_ = V.W, a = LY.a;
    // false landing candidate: a neighbour 1.4..3 stone widths away (in the overview plane)
    const wU = W.sw / W.tz; let cands = [];
    for (const s of stones) {
      if (s === W) continue;
      const d = Math.hypot(s.xo - W.xo, (s.yo - W.yo) * 1.6) / wU;
      if (d >= 1.3 && d <= 3.4) cands.push([s, d + (s.row === W.row ? 0 : 1.2) + (s.decor ? 4 : 0) + (isWon(s) ? 4 : 0)]);
    }
    cands.sort((p, q) => p[1] - q[1]);
    const F = cands.length ? cands[(Math.random() * Math.min(3, cands.length)) | 0][0] : null;
    const Fp = F ? [F.xo, F.yo] : [W.xo + (Math.random() < 0.5 ? -1 : 1) * wU * 2, W.yo];
    const vmax = LY.R === 1 ? 1 : LY.R - 1 + (LY.R < 4 ? 0.5 : 0);
    const yoOf = (v) => HY + G / (1 + a * v);
    const side0 = Math.random() < 0.5 ? -1 : 1, Wu = LY.Wu, vs = [0.18, 0.88, 0.4, 0.72, 0.28].map((q) => q * vmax * (0.85 + Math.random() * 0.25));
    const pts = [[W_ / 2, HY + G / LY.Zgate]];
    for (let i = 0; i < 4; i++) pts.push([W_ / 2 + side0 * (i % 2 ? -1 : 1) * (0.3 + Math.random() * 0.16) * Wu, yoOf(clamp(vs[i], 0, vmax + 0.2))]);
    pts.push([lerp(pts[4][0], Fp[0], 0.55), lerp(pts[4][1], Fp[1], 0.5)]); pts.push(Fp);
    R0 = { t: 0, W, F, Fp, path: catmull(pts), prize: px.prizeLabel(info?.prize?.name), ticks: 0, ev: {}, shake: 0, lastXo: pts[0][0], lastYo: pts[0][1] };
    R0.promise = new Promise((res) => { R0.res = res; });
    gh.on = true; gh.a = 0; gh.xo = pts[0][0]; gh.yo = pts[0][1]; gh.alt = 0; gh.spd = 0; gh.lean = 0;
    fin = null; $banner.classList.remove("on"); $stat.style.display = "none"; // the chip is idle-only
    return R0.promise;
  }

  function updateRoll(dt) {
    const r = R0; r.t += dt; const t = r.t, Tm = TIMES, ws = LY.ws, W = r.W;
    const ev = (name, at, fn) => { if (t >= at && !r.ev[name]) { r.ev[name] = 1; fn(); } };
    ev("drum0", 0.05, () => snd("drum"));
    ev("whoosh0", Tm.intro - 0.25, () => snd("whoosh"));
    ev("ticker", Tm.intro, () => $ticker.classList.add("on"));
    let xo, yo, alt;
    const hover = 1.9 * ws, Fh = r.F ? stoneH(r.F) : stoneH(W), Wh = stoneH(W);
    const altF = Fh + 0.28 * ws, altW = Wh + 0.28 * ws;
    if (t < Tm.intro) {
      const u = t / Tm.intro; [xo, yo] = r.path.pts[0]; alt = lerp(0.2 * ws, hover, easeOut(u)); gh.a = sstep(0.05, 0.7, u);
    } else if (t < Tm.sweepEnd) {
      const u = (t - Tm.intro) / (Tm.sweepEnd - Tm.intro), e = (1 - Math.cos(Math.PI * Math.pow(u, 0.8))) / 2;
      [xo, yo] = pathAt(r.path, e * r.path.L);
      alt = lerp(hover + Math.sin(t * 2.3) * 0.12 * ws, altF + 0.2 * ws, sstep(0.84, 1, u)); gh.a = 1;
    } else if (t < Tm.fakeEnd) {
      const u = (t - Tm.sweepEnd) / (Tm.fakeEnd - Tm.sweepEnd);
      [xo, yo] = r.Fp; xo += Math.sin(t * 9) * 2 * sstep(0.55, 0.9, u) * (W.sw / W.tz) * 0.04;
      alt = altF + 0.2 * ws * (1 - sstep(0, 0.28, u)) - 0.08 * ws * Math.sin(u * 12) * sstep(0.3, 0.8, u);
    } else if (t < Tm.hopEnd) {
      const u = (t - Tm.fakeEnd) / (Tm.hopEnd - Tm.fakeEnd), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      xo = lerp(r.Fp[0], W.xo, e); yo = lerp(r.Fp[1], W.yo, e);
      alt = lerp(altF, altW, e) + Math.sin(Math.PI * e) * 0.6 * ws;
    } else { xo = W.xo; yo = W.yo; alt = altW + Math.sin(t * 3) * 0.04 * ws; gh.a = 1 - sstep(Tm.split - 0.15, Tm.split + 0.35, t); }
    const sp = Math.hypot(xo - r.lastXo, yo - r.lastYo) / Math.max(dt, 1e-3);
    gh.spd = lerp(gh.spd, sp, 1 - Math.exp(-dt * 8)); gh.vx = lerp(gh.vx, (xo - r.lastXo) / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 10));
    gh.lean = lerp(gh.lean, clamp(gh.vx / 1200, -1, 1), 1 - Math.exp(-dt * 7));
    r.lastXo = xo; r.lastYo = yo; gh.xo = xo; gh.yo = yo; gh.alt = alt;

    // lantern light on stones + names ticker
    if (t >= Tm.intro * 0.6 && t < Tm.crack + 0.4) {
      const Zg = G / Math.max(1, yo - HY), Ro = 2.0 * ws / Zg + 12;
      const near = lightAt(xo, yo, Ro, 1);
      if (near && near.id !== tickerId) {
        tickerId = near.id; $tname.textContent = near.p?.name ?? "";
        if (T - tickT > 0.055) { snd("tick"); tickT = T; }
      }
    } else if (t >= Tm.crack + 0.4 && tickerId !== W.id) { tickerId = W.id; $tname.textContent = W.p.name; }
    ev("drumFake", Tm.sweepEnd, () => { snd("drum"); r.shake = 1.0; });
    ev("sigh", Tm.fakeEnd - 0.5, () => { snd("whoosh"); });
    ev("hop", Tm.fakeEnd, () => snd("whoosh"));
    ev("drumLand", Tm.hopEnd - 0.1, () => { snd("drum"); r.shake = 1.4; });
    if (t > Tm.fakeEnd - 0.3 && t < Tm.fakeEnd + 0.05 && Math.random() < dt * 14) snd("tick");

    // trail
    if (gh.a > 0.1 && t < Tm.split && Math.random() < dt * 60) {
      const Z = G / Math.max(1, yo - HY);
      trail.push({ X: (xo - V.W / 2) * Z + (Math.random() - 0.5) * ws * 0.3, Z, A: alt + (Math.random() - 0.5) * ws * 0.7, life: 0, col: Math.random() < 0.5 ? "124,255,79" : "170,110,255" });
      if (trail.length > 140) trail.shift();
    }

    // crack, split, hand
    const crackP = clamp((t - Tm.crack) / (Tm.split - Tm.crack), 0, 1);
    if (!fin && t >= Tm.crack) fin = { s: W, crackP: 0, splitE: 0, handE: 0, fade: 1, t0: T, p: W.p, beam: 0 };
    if (fin) {
      fin.crackP = crackP; fin.splitE = easeOut((t - Tm.split) / 0.75); fin.handE = easeBack((t - Tm.hand) / 1.05); fin.beam = sstep(Tm.split, Tm.split + 0.3, t) * (1 - 0.35 * sstep(Tm.split + 1.5, Tm.split + 3, t));
    }
    ev("split", Tm.split, () => { snd("boom"); r.shake = 2.4; r.burst = true; });
    ev("banner", Tm.banner, () => { $round.textContent = r.prize; $round.style.display = r.prize ? "" : "none"; $banner.classList.add("on"); $ticker.classList.remove("on"); });
    ev("win", Tm.win, () => snd("win"));
    ev("end", Tm.end, () => { justWon.add(W.id); wonSet.add(W.id); updateStat(); const res = r.res; r.res = null; R0 = null; res && res(); });
  }

  function doReset() {
    $banner.classList.remove("on"); $ticker.classList.remove("on"); tickerId = null; $stat.style.display = "";
    if (R0) { const res = R0.res; R0 = null; res && res(); }
    gh.on = false;
    if (fin) { fin.leaving = T; }
  }

  // ------------------------------------------------------------------ avatars
  let avLoaded = 0;
  function requestAvatar(s, force) {
    if (s.av || !s.p?.avatar || ctx.privacy?.avatars === false) return;
    if (!force && avLoaded > 160) return;
    const im = new Image(); im.decoding = "async"; s.av = { im, ok: false }; avLoaded++;
    im.onload = () => { s.av.ok = true; }; im.onerror = () => { s.av.bad = true; };
    im.src = s.p.avatar;
  }

  // ------------------------------------------------------------------ baking
  // ------------------------------------------------------------------ baking
  async function init() {
    try { await px.ensureFont(); } catch { /* ok */ }
    await Promise.all([heroWave, heroBlink, bgImg].map((im) => im.decode().catch(() => {})));
    if (destroyed) return;
    A.setHeads(heroWave, heroBlink);
    const pump = A.bakePumpkin();
    B = {
      stones: A.bakeStones(), pumpkin: pump, gate: A.bakeGate(px.fontFamily(), pump[2]), bats: A.bakeBats(), hand: A.bakeHand(),
      fog: [A.bakeFog(1, "150,165,225"), A.bakeFog(2, "175,135,255"), A.bakeFog(3, "120,200,140")], halves: new Map(),
    };
    bakeBackground();
    ready = true;
  }
  /** Sky = the bg-night picture reduced to art pixels; the side trees/pumpkins are re-drawn in front with a dithered edge. */
  function bakeBackground() {
    const wA = Math.ceil(V.W / 4), hA = Math.ceil(VH / 4);
    const bg = A.cv(wA, hA), bc = bg.getContext("2d");
    bc.fillStyle = "#0a0612"; bc.fillRect(0, 0, wA, hA);
    if (px.ready(bgImg)) {
      const k = Math.max(wA / bgImg.naturalWidth, hA / bgImg.naturalHeight), iw = bgImg.naturalWidth * k, ih = bgImg.naturalHeight * k;
      bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = "high";
      bc.drawImage(bgImg, (wA - iw) / 2, (hA - ih) / 2, iw, ih);
    }
    const fg = A.cv(wA, hA), fc = fg.getContext("2d"); fc.drawImage(bg, 0, 0);
    const im = fc.getImageData(0, 0, wA, hA), d = im.data;
    for (let j = 0; j < hA; j++) for (let i = 0; i < wA; i++) {
      const x = i * 4, e = Math.min(x, V.W - x), o = (j * wA + i) * 4, keep = Math.max(0, 1 - Math.floor(Math.max(0, e - 330) / 48) / 6); // side picture fades out in 6 hard alpha steps: no rectangle edge
      d[o + 3] = Math.round(keep * 255);
    }
    fc.putImageData(im, 0, 0);
    Object.assign(B, { bg, fg, ground: A.bakeGround(wA, Math.ceil((VH - snap4(HY)) / 4)), far: A.bakeFar(wA), haze: A.bakeHaze(wA), vign: A.bakeVignette(wA, hA), dark: A.bakeDark() });
  }

  // ------------------------------------------------------------------ resize
  function resize() {
    const cw = root.clientWidth || innerWidth, ch = root.clientHeight || innerHeight;
    V.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(cw * V.dpr)); canvas.height = Math.max(2, Math.round(ch * V.dpr));
    V.s = canvas.height / VH; V.W = canvas.width / V.s;
    L = px.lowres(V.W, VH, 4);
    ui.style.setProperty("--u", String(ch / VH));
    if (B) bakeBackground();
    if (parts.length || stones.length) relayout(); else makeWisps();
  }
  const ro = new ResizeObserver(() => resize()); ro.observe(root);

  // ------------------------------------------------------------------ rendering (world pass: g = low-res layer)
  const projX = (X, k) => V.W / 2 + (X - cam.cx) * k + cam.shx;
  const baseY = (k) => HY + cam.camH * k + cam.shy;
  const lvlOf = (swp) => clamp(Math.round(Math.log2(96 / Math.max(1, swp / 4))), 0, A.LEVELS - 1);

  function drawFog(item, t) {
    const dz = item.z - cam.zc; if (dz < 0.12) return;
    const k = 1 / dz, img = B.fog[item.i % 3];
    const fw = Math.ceil(Math.min(1800 * k, 5000) / 4) * 4, fh = Math.round(fw / 16) * 4, by = baseY(k);
    if (by - fh * 0.55 > VH || by + fh * 0.5 < 0) return;
    const off = (((-cam.cx * k * 0.9 + t * 16 * k + item.i * 411) % fw) + fw) % fw, y = snap4(by - fh * 0.72);
    g.globalAlpha = item.a * clamp(1.5 / (0.5 + k * 0.5), 0.25, 1);
    for (let x = -off; x < V.W; x += fw) g.drawImage(img, snap4(x), y, fw, fh);
    g.globalAlpha = 1;
  }

  function drawPumpkin(cx, py, pw) {
    const K = clamp(Math.round(Math.log2(40 / Math.max(1, pw / 4))), 0, 2), dw = Math.max(4, Math.round(pw / 4) * 4), dh = Math.max(4, Math.round((pw * 0.87) / 4) * 4);
    g.drawImage(B.pumpkin[K], snap4(cx - dw / 2), snap4(py - pw * 0.8), dw, dh);
  }

  function drawRow(row, t) {
    const W = V.W, kf = cam.kf, zc = cam.zc;
    const sil = [];
    let adds = null;
    for (const s of row.stones) {
      const dz = s.z - zc; if (dz < 0.045) continue;
      const k = 1 / dz; if (k > 2.4 * kf) continue;
      const sx = projX(s.x, k), by = baseY(k), swp = s.sw * k;
      if (sx + swp * 0.9 < 0 || sx - swp * 0.9 > W || by < 0 || by - swp * 2.2 > VH) continue;
      let alpha = (k > 1.5 * kf ? clamp((2.4 * kf - k) / (0.9 * kf), 0, 1) : 1);
      const rise = easeOut((t - s.born) / 0.9); if (rise <= 0) continue;
      alpha *= clamp(rise * 1.6, 0, 1);
      const won = isWon(s);
      const hidden = fin && fin.s === s && fin.splitE > 0 && !fin.leaving;
      if (swp < 10 && s.light < 0.04 && !hidden) {
        sil.push(sx, by, swp);
        if (s.tier >= 2 && !s.decor && !won) { (adds ??= []).push(sx + swp * 0.62, by, swp, s.ph); }
        continue;
      }
      const Lt = s.light;
      let ox = 0, oy = (1 - rise) * swp * 0.9;
      if (R0 && R0.W === s) { const sh = (R0.t > TIMES.crack - 0.15 ? clamp((R0.t - TIMES.crack + 0.15) / 1.2, 0, 1) : 0) * (fin && fin.splitE > 0 ? 0 : 1); ox = (Math.random() - 0.5) * swp * 0.025 * sh * (reduced ? 0.3 : 1); oy += (Math.random() - 0.5) * swp * 0.012 * sh * (reduced ? 0.3 : 1); }
      const bs = swp / 240, x0 = sx + ox, yb = by + oy;
      g.globalAlpha = alpha;
      const fadeIn = fin && fin.s === s && fin.leaving ? clamp((T - fin.leaving) / 0.5, 0, 1) : 1;
      if (!hidden) {
        const K = lvlOf(swp), key = `${s.tier}${s.v}`;
        const bmp = (won && fadeIn >= 1 ? B.stones.broken : B.stones.s[key][0])[K];
        const dx = snap4(x0 - 160 * bs), dy = snap4(yb - A.GY * bs), dw = Math.max(4, Math.round((320 * bs) / 4) * 4), dh = Math.max(4, Math.round((440 * bs) / 4) * 4);
        g.drawImage(bmp, dx, dy, dw, dh);
        const Lq = Lt < 0.12 ? 0 : Math.ceil(Lt * 3) / 3; // lantern light in 3 hard steps
        if (Lq > 0 && !won) { g.globalAlpha = alpha * Lq; g.drawImage(B.stones.s[key][1][K], dx, dy, dw, dh); g.globalAlpha = alpha; }
        if (!s.decor && !won) {
          if (swp >= 126) drawName(s, swp, bs, Lt, x0, yb);
          if (swp >= 80) { requestAvatar(s); if (s.av?.ok) drawCameo(s, bs, x0, yb); }
        }
        if (fin && fin.s === s && fin.crackP > 0 && fin.splitE <= 0) drawCrack(x0, yb, swp, s);
      }
      if (!s.decor && !won && s.tier >= 2) {
        const pw = swp * (s.tier === 2 ? 0.46 : s.tier === 3 ? 0.5 : 0.56), py = by + swp * 0.07 - pw * 0.12;
        g.globalAlpha = alpha; drawPumpkin(sx + swp * 0.6, py, pw);
        (adds ??= []).push(sx + swp * 0.6, py - pw * 0.4, swp, s.ph);
        if (s.tier >= 3) { const p2 = pw * 0.72; drawPumpkin(sx - swp * 0.62, py, p2); (adds ??= []).push(sx - swp * 0.62, py - p2 * 0.38, swp * 0.8, s.ph + 2); }
      }
      if (Lt > 0.05 && !won) (adds ??= []).push(x0, yb - swp * 0.5, swp * 2.6 * Lt, -1 - Lt * 0.6);
      g.globalAlpha = 1;
    }
    if (sil.length) { // distant stones: plain pixel blocks with a notched top
      g.fillStyle = row.col;
      for (let i = 0; i < sil.length; i += 3) {
        const x = sil[i], y = sil[i + 1], w = Math.max(4, Math.round(sil[i + 2] / 4) * 4), h = Math.max(8, Math.round((sil[i + 2] * 1.25) / 4) * 4), x4 = snap4(x - w / 2), y4 = snap4(y);
        g.fillRect(x4, y4 - h, w, h);
        if (w >= 12) { g.fillRect(x4 + 4, y4 - h - 4, w - 8, 4); }
      }
    }
    if (adds) {
      for (let i = 0; i < adds.length; i += 4) {
        const x = adds[i], y = adds[i + 1], w = adds[i + 2], ph = adds[i + 3];
        if (ph <= -1) { px.glow(g, x, y, w, "#ffcd82", 0.55 * (-ph - 1)); continue; }
        const fl = 0.7 + 0.2 * Math.sin(t * (3 + (ph % 3)) + ph * 7) + 0.1 * Math.sin(t * 11 + ph * 3);
        if (w < 10) { px.ember(g, x, y - 2, 4, "#ff8a1e"); }
        else px.glow(g, x, y, w * 0.95, "#ff8c28", 0.9 * fl);
      }
    }
  }

  function drawName(s, swp, bs, Lt, x0, yb) {
    const meta = B.stones.meta[s.tier];
    if (!s.nameU) s.nameU = Math.max(1, px.measure(mg, s.p.name, 100) / 100);
    const fs = Math.floor(Math.min((0.7 * swp) / s.nameU, swp * 0.19) / 4) * 4;
    if (fs < 24) return;
    const x = snap4(x0), y = snap4(yb - (A.GY - meta.nameY) * bs);
    g.font = px.font(fs); g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = Lt > 0.5 ? "rgba(255,230,170,.55)" : "rgba(196,200,255,.45)"; g.fillText(s.p.name, x, y + 4);
    g.fillStyle = Lt > 0.5 ? "#3a1c08" : "#1a0f24"; g.fillText(s.p.name, x, y);
  }
  function drawCameo(s, bs, x0, yb) {
    const meta = B.stones.meta[s.tier], size = Math.max(16, px.snap(68 * bs, 8)), cy = yb - (A.GY - meta.emblemY) * bs;
    const x = snap4(x0 - size / 2), y = snap4(cy - size / 2);
    px.photo(g, s.av.im, x, y, size); px.ring(g, x, y, size, size, "#ff8a2a");
  }

  const CRACK = [[0, 0], [-0.07, 0.14], [0.05, 0.27], [-0.09, 0.42], [0.06, 0.58], [-0.05, 0.74], [0.02, 0.88], [0, 1]];
  const BR = [[2, 0.14, 0.07], [3, -0.16, 0.05], [4, 0.17, 0.06], [5, -0.15, 0.08]];
  const crackPoint = (sx, by, swp, sh, p) => [sx + p[0] * swp, by - sh + p[1] * sh];
  function crackOff(dv) { // x offset (in stone widths) of the crack at relative height dv
    if (dv <= 0) return CRACK[0][0]; if (dv >= 1) return CRACK[CRACK.length - 1][0];
    const f = dv * (CRACK.length - 1), i = Math.floor(f); return lerp(CRACK[i][0], CRACK[i + 1][0], f - i);
  }
  /** A 1-art-pixel line (Bresenham) in design coordinates. */
  function pline(x0, y0, x1, y1, ox = 0, oy = 0) {
    let a = Math.round(x0 / 4) + ox, b = Math.round(y0 / 4) + oy; const a1 = Math.round(x1 / 4) + ox, b1 = Math.round(y1 / 4) + oy;
    const dx = Math.abs(a1 - a), dy = -Math.abs(b1 - b), sx = a < a1 ? 1 : -1, sy = b < b1 ? 1 : -1; let err = dx + dy;
    for (let n = 0; n < 1500; n++) { g.fillRect(a * 4, b * 4, 4, 4); if (a === a1 && b === b1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; a += sx; } if (e2 <= dx) { err += dx; b += sy; } }
  }
  function drawCrack(sx, by, swp, s) {
    const sh = (swp * A.TIER_H[s.tier - 1]) / 240, prog = fin.crackP * (CRACK.length - 1);
    const pts = []; for (let i = 0; i < CRACK.length; i++) { if (i > prog + 1) break; const p = crackPoint(sx, by, swp, sh, CRACK[i]); if (i > prog) { const q = pts[i - 1], f = prog - (i - 1); p[0] = lerp(q[0], p[0], f); p[1] = lerp(q[1], p[1], f); } pts.push(p); }
    const segs = []; for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    for (const [i, du, dv] of BR) if (i < pts.length - 0.01 && pts[i]) segs.push([pts[i][0], pts[i][1], pts[i][0] + du * swp, pts[i][1] + dv * sh]);
    g.fillStyle = "#ff6600"; for (const q of segs) { pline(q[0], q[1], q[2], q[3]); pline(q[0], q[1], q[2], q[3], 1, 0); pline(q[0], q[1], q[2], q[3], 0, 1); }
    g.fillStyle = "#fff0aa"; for (const q of segs) pline(q[0], q[1], q[2], q[3]);
  }

  // ---- the ghost
  function drawGhost(t) {
    if (!gh.on || gh.a <= 0.01) return;
    const Z = G / Math.max(1, gh.yo - HY), X = (gh.xo - V.W / 2) * Z, dz = Z - cam.zc; if (dz < 0.06) return;
    const k = 1 / dz, sx = projX(X, k), gy = baseY(k), sy = gy - gh.alt * k;
    const u = Math.max(0.55, (LY.ws * 0.78 * k) / 100), aq = Math.ceil(gh.a * 4) / 4;
    const ws = LY.ws, rx = 2.0 * ws * k, ry = rx * 0.3;
    const lit = R0 && R0.t > TIMES.sweepEnd && R0.t < TIMES.fakeEnd ? 0.8 + Math.sin(t * 22) * 0.2 * sstep(0.3, 1, (R0.t - TIMES.sweepEnd) / 1.5) : 1;
    const bob = Math.round((Math.sin(t * 2.6) * 4 * u) / 4) * 4, cy = sy + bob;
    const lx = sx - 66 * u, ly = cy + 45 * u;
    // ground pool: two dithered ellipses; lantern cone: three hard bands
    g.globalAlpha = 0.9 * aq * lit; g.drawImage(px.glowSprite("#ffcd82"), snap4(sx - rx), snap4(gy - ry), Math.max(8, snap4(rx * 2)), Math.max(8, snap4(ry * 2)));
    g.globalAlpha = 0.8 * aq * lit; g.drawImage(px.glowSprite("#ff8c28"), snap4(sx - rx * 0.45), snap4(gy - ry * 0.45), Math.max(8, snap4(rx * 0.9)), Math.max(8, snap4(ry * 0.9)));
    g.fillStyle = "#ffd08a"; g.globalAlpha = 0.09 * aq * lit;
    for (const f of [1, 0.62, 0.3]) { g.beginPath(); g.moveTo(snap4(lx - 5 * u), snap4(ly)); g.lineTo(snap4(lx + 5 * u), snap4(ly)); g.lineTo(snap4(sx + rx * 0.8 * f), snap4(gy)); g.lineTo(snap4(sx - rx * 0.8 * f), snap4(gy)); g.closePath(); g.fill(); }
    g.globalAlpha = 1;
    px.glow(g, sx, cy, 300 * u, "#8a3ffc", 0.55 * aq); px.glow(g, sx, cy, 200 * u, "#7cff4f", 0.25 * aq);
    const lvl = u >= 1.4 ? 0 : 1, unit = A.UNIT0 * 2 ** lvl, frame = Math.floor(t * 8) & 3, lean2 = Math.round(clamp(gh.lean, -1, 1) * 2);
    const spr = A.ghostSprite(frame, lean2, gh.blink > 0, lvl);
    g.globalAlpha = aq;
    g.drawImage(spr, snap4(sx + A.GHOST.x0 * u), snap4(cy + A.GHOST.y0 * u), Math.round((spr.width * unit * u) / 4) * 4, Math.round((spr.height * unit * u) / 4) * 4);
    g.globalAlpha = 1;
    px.glow(g, lx, ly, 150 * u, "#ffcd82", 0.9 * lit * aq);
  }

  function drawTrail(t, dt) {
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]; p.life += dt; if (p.life > 1.1) { trail.splice(i, 1); continue; }
      const dz = p.Z - cam.zc; if (dz < 0.06) continue; const k = 1 / dz;
      const x = projX(p.X, k), y = baseY(k) - (p.A + p.life * LY.ws * 0.25) * k, r = Math.max(2, LY.ws * 0.11 * k) * (1 - p.life / 1.1);
      g.globalAlpha = 0.7 * (1 - p.life / 1.1); px.ember(g, x, y, Math.max(4, r * 1.6), p.col[0] === "1" && p.col[1] === "2" ? "#7cff4f" : "#aa6eff");
    }
    g.globalAlpha = 1;
  }

  function drawWisps(t) {
    for (const w of wisps) {
      const Z = G / Math.max(1, w.yo - HY), dz = Z - cam.zc; if (dz < 0.06) continue; const k = 1 / dz;
      const x = projX((w.xo - V.W / 2) * Z, k) + Math.sin(t * 2 + w.ph) * 8 * k * 0.5, y = baseY(k) - (LY.ws * 0.9 + Math.sin(t * 1.6 + w.ph) * LY.ws * 0.1) * k;
      const r = Math.max(10, LY.ws * 0.28 * k);
      px.glow(g, x, y, r * 2.2, "#7cff4f", 1); px.disc(g, x, y, Math.max(4, r * 0.3), "#b8ff9a"); px.disc(g, x, y, Math.max(4, r * 0.14), "#f4fff0");
    }
    for (const w of wisps) { // name tags on small stones, drawn crisp after the layer is blitted
      if (!w.tgt || w.tag < 0.05) continue; const s = w.tgt, dz = s.z - cam.zc; if (dz < 0.06) continue;
      const k = 1 / dz, swp = s.sw * k; if (swp >= 70 || !s.p) continue;
      tags.push({ x: projX(s.x, k), y: baseY(k) - (swp * (A.TIER_H[s.tier - 1] / 240) + swp * 0.45) - 8, label: s.p.name, a: Math.ceil(w.tag * 4) / 4 });
    }
  }

  // ---- finale: halves, hand, sign
  const halvesFor = (s) => { const key = `${s.tier}${s.v}`; let h = B.halves.get(key); if (!h) B.halves.set(key, (h = A.bakeHalves(B.stones.s[key][0][0], s.tier))); return h; };
  function drawFinale(t, dt) {
    signRef.v = null;
    if (!fin) return;
    const s = fin.s, dz = s.z - cam.zc; if (dz < 0.045) return;
    let fa = 1; if (fin.leaving) { fa = 1 - clamp((T - fin.leaving) / 0.6, 0, 1); if (fa <= 0) { fin = null; return; } }
    const k = 1 / dz, sx = projX(s.x, k), by = baseY(k), swp = s.sw * k, bs = swp / 240, sh = (swp * A.TIER_H[s.tier - 1]) / 240;
    const spot = sstep(0, 1, (R0 ? R0.t - TIMES.crack + 0.3 : 3) / 1.2) * fa;
    if (spot > 0.01) { // dithered dark pool around the winner (hard steps, no radial gradient)
      const cx = snap4(sx), cy = snap4(by - sh * 0.5), W = V.W;
      g.globalAlpha = spot; g.drawImage(B.dark, cx - 400, cy - 240, 800, 480);
      g.fillStyle = "rgb(3,1,10)"; g.globalAlpha = spot * 0.627;
      g.fillRect(0, 0, W, Math.max(0, cy - 240)); g.fillRect(0, cy + 240, W, Math.max(0, VH - cy - 240));
      g.fillRect(0, cy - 240, Math.max(0, cx - 400), 480); g.fillRect(cx + 400, cy - 240, Math.max(0, W - cx - 400), 480);
      g.globalAlpha = 1;
    }
    g.globalAlpha = fa;
    const key = `${s.tier}${s.v}`;
    if (fin.splitE > 0) {
      const e = fin.splitE, ang = 0.3 * e, open = swp * 0.42 * e;
      // dark gap along the crack, row by row
      g.fillStyle = "#07060b";
      for (let y = snap4(by - sh); y < by; y += 4) g.fillRect(snap4(sx + crackOff((y - (by - sh)) / sh) * swp - open * 0.5), y, Math.max(4, snap4(open)), 4);
      if (fin.beam > 0.01) { // light beam in hard bands + a dithered pool at the base
        const top = by - VH * 0.9;
        for (const [wf, col, al] of [[0.9, "#7cff4f", 0.17], [0.55, "#ff9a30", 0.26], [0.22, "#ffeaa0", 0.5]]) { g.fillStyle = col; g.globalAlpha = fa * fin.beam * al; const bw = snap4(swp * wf); g.fillRect(snap4(sx) - bw / 2, top, bw, by - top); }
        g.globalAlpha = fa; px.glow(g, sx, by - swp * 0.25, swp * 1.8, "#ff8c28", fin.beam);
      }
      const hv = halvesFor(s), dw = Math.round((320 * bs) / 4) * 4, dh = Math.round((440 * bs) / 4) * 4;
      for (const side of [-1, 1]) {
        g.save(); g.globalAlpha = fa;
        const pv = [sx + side * swp * 0.5, by];
        g.translate(pv[0] + side * open, pv[1] + e * sh * 0.05); g.rotate(side * ang); g.translate(-pv[0], -pv[1]);
        g.drawImage(side < 0 ? hv.L : hv.R, snap4(sx - 160 * bs), snap4(by - A.GY * bs), dw, dh);
        g.restore();
      }
      drawHandSign(sx, by, swp, sh, t, fa);
      // earth strip in front
      g.save(); g.beginPath(); g.rect(snap4(sx - swp * 1.2), snap4(by), snap4(swp * 2.4), snap4(swp * 0.5)); g.clip();
      g.drawImage(B.stones.s[key][0][0], snap4(sx - 160 * bs), snap4(by - A.GY * bs), dw, dh); g.restore();
      if (R0 && R0.burst) { R0.burst = false; puff(sx, by - sh * 0.5, 70, { sp: 520, spread: 3.4, w: swp * 0.3, col: "190,175,160", r: swp * 0.03, life: 1.6, ay: 120 }); puff(sx, by - sh * 0.4, 60, { sp: 420, add: true, col: "255,150,40", r: 5, life: 1.8, ay: -120, spread: 2.2 }); puff(sx, by - sh * 0.4, 40, { sp: 380, add: true, col: "124,255,79", r: 4, life: 1.8, ay: -100, spread: 2.6 }); }
    }
    g.globalAlpha = 1;
    if (fin.splitE > 0.2 && Math.random() < dt * 40) puff(sx + (Math.random() - 0.5) * swp * 1.4, by - sh * 0.3, 1, { sp: 60, dir: -Math.PI / 2, spread: 0.8, add: true, col: Math.random() < 0.6 ? "255,150,40" : "124,255,79", r: 3.5, life: 2.6, ay: -40 });
  }

  /** The sign body (pole, fist, plank frame) goes into the layer; its text is drawn crisp afterwards (drawSignText). */
  function drawHandSign(sx, by, swp, sh, t, fa) {
    const p = fin.p, he = fin.handE; if (he <= 0) return;
    const pw0 = Math.max(0.065 * swp, 4), ph = px.snap(0.62 * swp, 8);
    const nameU = Math.max(1, px.measure(mg, p.name, 100) / 100);
    const pd = px.snap(ph * 0.74, 8), pad = ph * 0.13;
    const pw = px.snap(Math.min(Math.max(1.9 * swp, pd + pad * 3 + nameU * ph * 0.34), V.W * 0.9), 8);
    const avail = pw - pd - pad * 3, fs = Math.floor(Math.min(ph * 0.5, avail / nameU));
    const rise = (1 - he) * (sh * 0.95 + ph), plankCY = -(sh * 0.62 + ph * 0.5), clipY = snap4(by + swp * 0.03);
    const cx = snap4(sx), oy = snap4(by + rise);
    g.save(); g.beginPath(); g.rect(0, 0, V.W, clipY); g.clip();
    g.globalAlpha = fa;
    // pole
    const poleW = Math.max(12, snap4(pw0)), poleTop = snap4(oy + plankCY);
    g.fillStyle = "#0e0e10"; g.fillRect(cx - poleW / 2 - 4, poleTop, poleW + 8, 2400);
    g.fillStyle = "#7b5230"; g.fillRect(cx - poleW / 2, poleTop, poleW, 2400);
    g.fillStyle = "#4b2f16"; g.fillRect(cx + poleW / 2 - Math.max(4, snap4(poleW / 3)), poleTop, Math.max(4, snap4(poleW / 3)), 2400);
    // sleeve + fist
    const fy = oy - sh * 0.26, fsc = Math.max(1, Math.round((pw0 * 2.7 * 1.45) / 96)), hw = 24 * 4 * fsc, hh = 16 * 4 * fsc, hxp = snap4(cx - hw * 0.46), hyp = snap4(fy - hh * 0.55);
    const slW = snap4(hw * 0.52), slX = cx - slW / 2, slY = hyp + hh - 8 * fsc;
    g.fillStyle = "#0e0e10"; g.fillRect(slX - 4, slY, slW + 8, 2400);
    g.fillStyle = "#3a2a4d"; g.fillRect(slX, slY, slW, 2400);
    g.fillStyle = "#5a4378"; g.fillRect(slX, slY, 8, 2400); g.fillStyle = "#241830"; g.fillRect(slX + slW - 8, slY, 8, 2400);
    g.drawImage(B.hand, hxp, hyp, hw, hh);
    // plank
    const bob = Math.round((Math.sin(t * 1.5) * swp * 0.012 * Math.min(1, he)) / 4) * 4;
    const px0 = snap4(cx - pw / 2), py = snap4(oy + plankCY + bob - ph / 2);
    px.box(g, px0, py, pw, ph, { fill: "#5a3a1f", frame: "#ff6600", shadow: false });
    g.fillStyle = "rgba(20,10,4,.35)"; g.fillRect(px0 + 4, py + snap4(ph * 0.34), pw - 8, 4); g.fillRect(px0 + 4, py + snap4(ph * 0.68), pw - 8, 4);
    g.fillStyle = "#d8c490"; for (const [nx, ny] of [[12, 12], [pw - 16, 12], [12, ph - 16], [pw - 16, ph - 16]]) g.fillRect(px0 + nx, py + ny, 4, 4);
    g.restore();
    signRef.v = { p, cx, cy: py + ph / 2, pw, ph, pd, pad, fs, clipY, fa };
  }

  /** Crisp overlay of the winner sign: portrait (pixelated), the huge name, handle and tickets. */
  function drawSignText() {
    const S = signRef.v; if (!S || !fin) return;
    const { p, cx, cy, pw, pd, pad, fs, clipY } = S;
    mg.save(); mg.beginPath(); mg.rect(0, 0, V.W, clipY); mg.clip(); mg.globalAlpha = S.fa;
    const pX = snap4(cx - pw / 2 + pad * 1.4), pY = snap4(cy - pd / 2);
    if (!(fin.s.av?.ok && px.photo(mg, fin.s.av.im, pX, pY, pd))) {
      px.box(mg, pX, pY, pd, pd, { fill: "#4a2a8a", frame: "#8a3ffc", shadow: false });
      px.text(mg, (p.name || "?").trim().charAt(0).toUpperCase(), pX + pd / 2, pY + pd / 2, { size: pd * 0.6, align: "center", color: "#fff4dc" });
    }
    px.ring(mg, pX, pY, pd, pd, "#ff8a2a");
    const tx = pX + pd + pad * 1.2, tw = cx + pw / 2 - pad * 1.2 - tx;
    const sub = `${p.handle ? p.handle + "  ·  " : ""}${p.tickets} ${plural(p.tickets)}`;
    const nsz = px.fit(mg, p.name, fs, tw), ssz = px.fit(mg, sub, Math.floor(fs * 0.36), tw);
    px.text(mg, p.name, tx, cy - nsz * 0.32, { size: nsz, color: "#fff4dc", drop: "#7a2c00", depth: Math.max(4, snap4(nsz / 16)) });
    px.text(mg, sub, tx, cy + nsz * 0.5 + ssz * 0.15, { size: ssz, color: "#7cff4f" });
    mg.restore();
  }
  function drawTags() {
    for (const tg of tags) {
      mg.globalAlpha = tg.a;
      const tw = snap4(px.measure(mg, tg.label, 24) + 32), bx = snap4(tg.x - tw / 2), by = snap4(tg.y - 28);
      px.box(mg, bx, by, tw, 48, { fill: "#1a0f24", frame: "#7cff4f", shadow: false });
      px.text(mg, tg.label, tg.x, by + 24, { size: 24, align: "center" });
    }
    mg.globalAlpha = 1; tags.length = 0;
  }

  function drawBats(t) {
    for (let i = 0; i < 5; i++) {
      const sp = 38 + i * 9, x = ((t * sp + i * 420) % (V.W + 300)) - 150, y = 120 + i * 46 + Math.sin(t * 0.7 + i * 2) * 40, sc = i % 3 === 0 ? 8 : 4;
      g.drawImage(B.bats[Math.floor(t * (7 + i)) & 1], snap4(x), snap4(y), 13 * sc, 5 * sc);
    }
  }

  function render(dt) {
    const W = V.W, t = T;
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalAlpha = 1; mg.globalCompositeOperation = "source-over";
    if (!ready || !L) { mg.fillStyle = "#0a0912"; mg.fillRect(0, 0, canvas.width, canvas.height); return; }
    g = L.begin(); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    const hyS = snap4(HY);
    g.drawImage(B.bg, 0, 0, B.bg.width * 4, B.bg.height * 4);
    for (let i = 0; i < STARS.length; i++) { // twinkling stars: hard pixel crosses
      if ((Math.floor(t * 1.4 + i * 0.7) + i) % 3) continue;
      const x = snap4((STARS[i][0] * W) / 1920), y = snap4(STARS[i][1]); g.fillStyle = "#f4f1ea";
      g.fillRect(x, y, 4, 4); g.fillRect(x - 4, y, 4, 4); g.fillRect(x + 4, y, 4, 4); g.fillRect(x, y - 4, 4, 4); g.fillRect(x, y + 4, 4, 4);
    }
    drawBats(t);
    if (lightning > 0) { g.fillStyle = `rgba(190,170,255,${0.16 * Math.ceil(lightning * 3) / 3})`; g.fillRect(0, 0, W, hyS); }
    g.drawImage(B.ground, 0, hyS, B.ground.width * 4, B.ground.height * 4);
    g.drawImage(B.fg, 0, 0, B.fg.width * 4, B.fg.height * 4); // side trees and pumpkins of the picture (behind the stones)
    g.drawImage(B.far, 0, hyS + 8 - B.far.height * 4, B.far.width * 4, B.far.height * 4);
    { const Zg = LY.Zgate, dz = Zg - cam.zc; if (dz > 0.1) { const k = 1 / dz, gw = 520 * Zg * k, gx = projX(0, k), gyb = baseY(k), dw = Math.round(gw / 4) * 4, dh = Math.round((gw * 90) / 130 / 4) * 4; g.drawImage(B.gate, snap4(gx - dw / 2), snap4(gyb - dh + gw * 0.02), dw, dh); } }
    for (const it of drawList) { if (it.fog) drawFog(it, t); else drawRow(it.row, t); }
    drawTrail(t, dt);
    drawFinale(t, dt);
    drawGhost(t);
    drawWisps(t);
    for (let i = parts_fx.length - 1; i >= 0; i--) { // particles: hard squares
      const p = parts_fx[i]; p.life += dt; if (p.life >= p.max) { parts_fx.splice(i, 1); continue; }
      p.vy += p.ay * dt; p.vx *= 1 - dt * 0.8; p.x += p.vx * dt; p.y += p.vy * dt;
      const f = 1 - p.life / p.max;
      if (p.add) { g.globalAlpha = Math.min(1, f * 1.4); px.ember(g, p.x, p.y, Math.max(4, p.r * (0.7 + f)), `rgb(${p.col})`); }
      else { g.globalAlpha = 1; px.ember(g, p.x, p.y, Math.max(4, p.r * (2.6 - f) * 1.4), `rgba(${p.col},${f * 0.4})`); }
    }
    g.globalAlpha = 1;
    g.drawImage(B.haze, 0, hyS - 100, B.haze.width * 4, B.haze.height * 4);
    g.globalAlpha = 0.2;
    for (let i = 0; i < 2; i++) { const fw = 2000, off = (((t * (12 + i * 7) - cam.cx * 0.1 + i * 700) % fw) + fw) % fw; for (let x = off - fw; x < W; x += fw) g.drawImage(B.fog[(i + 1) % 3], snap4(x), snap4(VH - 230 - i * 40), fw, snap4((fw / 4) * 0.9)); }
    g.globalAlpha = 1;
    g.drawImage(B.vign, 0, 0, B.vign.width * 4, B.vign.height * 4);
    if (R0 && R0.t < 1.3 && !reduced) { g.fillStyle = `rgba(20,0,40,${0.18 * (1 - R0.t / 1.3)})`; g.fillRect(0, 0, W, VH); }
    g = mg; mg.setTransform(V.s, 0, 0, V.s, 0, 0);
    L.blit(mg, 0, 0, W, VH);
    drawSignText(); drawTags();
  }

  // ------------------------------------------------------------------ loop
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - (last || now)) / 1000, 0.001, 0.05); last = now;
    T += dt; frameNo++;
    if (!ready) { render(dt); return; }
    // blink
    gh.nextBlink -= dt; if (gh.nextBlink < 0) { gh.blink = 0.14; gh.nextBlink = 2.5 + Math.random() * 2.5; } gh.blink = Math.max(0, gh.blink - dt);
    // stones: tween to targets
    for (const s of stones) { const dx = s.tx - s.x, dz = s.tz - s.z; if (dx * dx + dz * dz > 1e-6) { const k = 1 - Math.exp(-dt * 4); s.x += dx * k; s.z += dz * k; } }
    // light update
    if (R0) updateRoll(dt); else if (!fin) { if (wisps.length) updateWisps(dt); }
    if (!R0 && fin && fin.splitE >= 1) { /* hold */ }
    if (!reduced) { nextLightning -= dt; if (nextLightning < 0) { lightning = 1; nextLightning = 14 + Math.random() * 18; } lightning = Math.max(0, lightning - dt * 3.5); }
    for (let i = warm.length - 1; i >= 0; i--) {
      const s = warm[i]; const tg = s.stamp === frameNo ? s.tgt : 0;
      s.light += (tg - s.light) * (1 - Math.exp(-dt * (tg > s.light ? 12 : 2.2)));
      if (s.light < 0.01 && tg === 0) { s.light = 0; s.inW = false; warm.splice(i, 1); }
    }
    // camera
    let tgt = idleTarget(), rate = 2.0, zr = 1.8;
    const idleOn = !R0 && !(fin && !fin.leaving);
    if (R0) {
      const r = R0, t = r.t, ws = LY.ws, kc = kClose(), W = r.W, a = LY.a;
      const finalK = clamp(380 / (W.sw), 1.05, 90);
      const gZ = G / Math.max(1, gh.yo - HY), gX = (gh.xo - V.W / 2) * gZ;
      if (t < TIMES.intro) { tgt = { Xf: gX * 0.2, Zf: lerp(1, gZ, 0.2), lk: 0, yb: HY + G }; rate = 2; zr = 2; }
      else if (t < TIMES.sweepEnd) {
        const gain = 0.15 + 0.85 * clamp((kc - 1) / 1.2, 0, 1), sn = clamp(gh.spd / 1500, 0, 1);
        let lkT = Math.log(kc) * (1 - 0.5 * sn); if (kc <= 1.001) lkT = 0.05 * sstep(0.1, 0.9, (t - TIMES.intro) / 3);
        const zw = clamp(lkT / 0.35, 0, 1);
        tgt = { Xf: gX * gain, Zf: lerp(1, gZ, zw), lk: lkT, yb: clamp(0.4 * VH + 2.2 * ws * Math.exp(lkT), 0.74 * VH, 0.84 * VH), xr: gain > 0.5 ? 18 : 0 };
        rate = gain > 0.5 ? 14 : 3.2; zr = 2.4;
      } else if (t < TIMES.fakeEnd) {
        const F = r.F ?? W, fz = F.tz;
        tgt = { Xf: lerp(F.tx, W.tx, 0.35), Zf: lerp(fz, W.tz, 0.35), lk: Math.log(Math.max(1, Math.min(finalK * 0.75, kc * 1.6))), yb: 0.82 * VH }; rate = 3.0; zr = 1.6;
      } else { tgt = { Xf: W.tx, Zf: W.tz, lk: Math.log(finalK), yb: 0.88 * VH }; rate = 3.4; zr = 2.0; }
    } else if (fin && !fin.leaving) {
      const W = fin.s, finalK = clamp(380 / W.sw, 1.05, 90);
      tgt = { Xf: W.tx, Zf: W.tz, lk: Math.log(finalK), yb: 0.88 * VH }; rate = 3.4; zr = 2.0;
    }
    camStep(dt, tgt, rate, zr);
    if (R0 && R0.t > TIMES.intro && R0.t < TIMES.fakeEnd) { const gZ2 = G / Math.max(1, gh.yo - HY), ik = 1 / Math.exp(cam.lk); cam.Zf = clamp(cam.Zf, gZ2 - 0.9 * ik, gZ2 + 0.25 * ik); }
    // shake
    let sh = 0;
    if (R0) {
      const t = R0.t;
      sh = (t > TIMES.sweepEnd && t < TIMES.sweepEnd + 0.5 ? 6 * (1 - (t - TIMES.sweepEnd) / 0.5) : 0) + (t > TIMES.hopEnd - 0.1 && t < TIMES.hopEnd + 0.4 ? 7 * (1 - (t - TIMES.hopEnd + 0.1) / 0.5) : 0)
        + sstep(TIMES.crack, TIMES.split, t) * 9 * (t < TIMES.split ? 1 : 0) + (t >= TIMES.split && t < TIMES.split + 0.9 ? 20 * (1 - (t - TIMES.split) / 0.9) : 0);
    }
    if (reduced) sh *= 0.15;
    cam.shx = (Math.random() - 0.5) * sh; cam.shy = (Math.random() - 0.5) * sh;
    camCompute(idleOn);
    render(dt);
  }

  resize();
  init();
  raf = requestAnimationFrame(frame);

  return {
    setParticipants(list) { parts = list.slice(); justWon.clear(); wonSet.clear(); for (const p of parts) if (p.won) wonSet.add(p.id); relayout(); },
    roll(winner, info) { return startRoll(winner, info); },
    reset() { doReset(); },
    destroy() { destroyed = true; cancelAnimationFrame(raf); ro.disconnect(); if (R0?.res) R0.res(); R0 = null; root.replaceChildren(); },
  };
}
