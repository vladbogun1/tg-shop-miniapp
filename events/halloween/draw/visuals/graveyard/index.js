// «Цвинтар» — draw screen visual for the Halloween stream. See ../../VISUAL-CONTRACT.md.
// Participants are tombstones in perspective rows; a mascot-ghost flies over them with a lantern,
// the camera follows, false landing, the winner's stone cracks and a hand rises with a sign.
import * as A from "./art.js";

export const meta = { id: "graveyard", title: "Цвинтар", author: "agent" };

const VH = 1080, HY = VH * 0.32, G = VH * 0.5; // horizon y and ground span (front row stands at HY+G)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeBack = (t) => { t = clamp(t, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const TIER_M = [1, 1.1, 1.22, 1.38];
const TIMES = { intro: 1.3, sweepEnd: 8.3, fakeEnd: 9.8, hopEnd: 10.6, crack: 10.5, split: 11.6, hand: 11.75, banner: 11.85, win: 12.1, end: 13.3 };

const CSS = `
.gy-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
.gy-ui{position:absolute;inset:0;pointer-events:none;font-family:"Exo 2",system-ui,sans-serif;color:#f4f1ea}
.gy-stat{position:absolute;left:calc(var(--u)*24px);top:calc(var(--u)*22px);padding:calc(var(--u)*8px) calc(var(--u)*18px);border-radius:999px;
  background:rgba(14,14,16,.62);border:1px solid rgba(255,102,0,.45);font-weight:600;font-size:calc(var(--u)*21px);letter-spacing:.02em;
  backdrop-filter:blur(6px);white-space:nowrap}
.gy-stat b{color:#ff8a2a;font-weight:800}
.gy-banner{position:absolute;left:0;right:0;top:calc(var(--u)*104px);text-align:center;opacity:0;transform:translateY(calc(var(--u)*-26px)) scale(.86);
  transition:opacity .45s ease,transform .7s cubic-bezier(.2,1.5,.4,1)}
.gy-banner.on{opacity:1;transform:none}
.gy-banner .t{font-weight:900;font-size:calc(var(--u)*118px);line-height:1;letter-spacing:.07em;color:#fff2d8;
  text-shadow:0 0 calc(var(--u)*26px) rgba(255,102,0,.95),0 0 calc(var(--u)*70px) rgba(255,102,0,.55),0 calc(var(--u)*5px) 0 #8a2f00}
.gy-banner .r{display:inline-block;margin-top:calc(var(--u)*10px);padding:calc(var(--u)*6px) calc(var(--u)*30px);border-radius:999px;background:#ff6600;color:#170800;
  font-weight:800;font-size:calc(var(--u)*40px);letter-spacing:.04em;box-shadow:0 0 calc(var(--u)*34px) rgba(255,102,0,.7)}
.gy-ticker{position:absolute;left:0;right:0;bottom:calc(var(--u)*46px);text-align:center;opacity:0;transform:translateY(calc(var(--u)*16px));transition:opacity .35s,transform .35s}
.gy-ticker.on{opacity:1;transform:none}
.gy-ticker .box{display:inline-flex;align-items:baseline;gap:calc(var(--u)*18px);padding:calc(var(--u)*10px) calc(var(--u)*34px) calc(var(--u)*12px);border-radius:calc(var(--u)*22px);
  background:linear-gradient(180deg,rgba(26,16,40,.82),rgba(12,8,20,.86));border:2px solid rgba(124,255,79,.55);box-shadow:0 0 calc(var(--u)*40px) rgba(124,255,79,.25),inset 0 0 calc(var(--u)*24px) rgba(138,63,252,.25)}
.gy-ticker .l{font-weight:700;font-size:calc(var(--u)*24px);color:#7cff4f;text-transform:uppercase;letter-spacing:.14em}
.gy-ticker .n{font-weight:800;font-size:calc(var(--u)*62px);color:#fff;min-width:calc(var(--u)*320px);text-shadow:0 0 calc(var(--u)*18px) rgba(255,160,60,.6)}
`;

const imgs = {};
function loadImg(name) {
  const i = new Image(); i.decoding = "async";
  i.src = new URL(`../../assets/sprites/${name}.png`, import.meta.url).href;
  imgs[name] = i; return i;
}
function pixelScale(src, k) { // nearest-neighbour upscale once, so later smooth scaling keeps pixels crisp
  const c = A.cv(src.width * k, src.height * k), g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height); return c;
}
const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? "квиток" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "квитки" : "квитків");

export function mount(root, ctx) {
  const reduced = !!ctx.reducedMotion;
  const snd = (n) => { try { ctx.sound?.(n); } catch { /* sound is optional */ } };
  root.style.cssText += ";position:absolute;inset:0;overflow:hidden;background:#07060a";
  const style = document.createElement("style"); style.textContent = CSS; root.append(style);
  const canvas = document.createElement("canvas"); canvas.className = "gy-cv"; root.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });
  const ui = document.createElement("div"); ui.className = "gy-ui";
  ui.innerHTML = `<div class="gy-stat"></div><div class="gy-banner"><div class="t">ПЕРЕМОЖЕЦЬ</div><div class="r"></div></div><div class="gy-ticker"><div class="box"><span class="l">Учасник</span><b class="n"></b></div></div>`;
  root.append(ui);
  const $stat = ui.querySelector(".gy-stat"), $banner = ui.querySelector(".gy-banner"), $round = ui.querySelector(".gy-banner .r");
  const $ticker = ui.querySelector(".gy-ticker"), $tname = ui.querySelector(".gy-ticker .n");

  const heroWave = loadImg("hero_wave"), heroBlink = loadImg("hero_blink");
  let headA = null, headB = null;

  const V = { W: 1920, s: 1, dpr: 1 };
  let ready = false, destroyed = false, raf = 0, T = 0, last = 0;
  let B = null; // baked art

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
      row.col = `rgb(${Math.round(lerp(34, 40, dep))},${Math.round(lerp(38, 30, dep))},${Math.round(lerp(58, 66, dep))})`;
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
    R0 = { t: 0, W, F, Fp, path: catmull(pts), round: info?.round ?? 1, total: info?.totalRounds ?? 5, ticks: 0, ev: {}, shake: 0, lastXo: pts[0][0], lastYo: pts[0][1] };
    R0.promise = new Promise((res) => { R0.res = res; });
    gh.on = true; gh.a = 0; gh.xo = pts[0][0]; gh.yo = pts[0][1]; gh.alt = 0; gh.spd = 0; gh.lean = 0;
    fin = null; $banner.classList.remove("on");
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
    if (!fin && t >= Tm.crack) fin = { s: W, crackP: 0, splitE: 0, handE: 0, fade: 1, t0: T, p: W.p, round: r.round, total: r.total, beam: 0 };
    if (fin) {
      fin.crackP = crackP; fin.splitE = easeOut((t - Tm.split) / 0.75); fin.handE = easeBack((t - Tm.hand) / 1.05); fin.beam = sstep(Tm.split, Tm.split + 0.3, t) * (1 - 0.35 * sstep(Tm.split + 1.5, Tm.split + 3, t));
    }
    ev("split", Tm.split, () => { snd("boom"); r.shake = 2.4; r.burst = true; });
    ev("banner", Tm.banner, () => { $round.textContent = `Раунд ${r.round} з ${r.total}`; $banner.classList.add("on"); $ticker.classList.remove("on"); });
    ev("win", Tm.win, () => snd("win"));
    ev("end", Tm.end, () => { justWon.add(W.id); wonSet.add(W.id); updateStat(); const res = r.res; r.res = null; R0 = null; res && res(); });
  }

  function doReset() {
    $banner.classList.remove("on"); $ticker.classList.remove("on"); tickerId = null;
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
  async function init() {
    try { await Promise.all([document.fonts.load('800 40px "Exo 2"'), document.fonts.load('700 40px "Exo 2"'), document.fonts.load('900 40px "Exo 2"')]); } catch { /* ok */ }
    await Promise.all([heroWave, heroBlink].map((im) => im.decode().catch(() => {})));
    if (destroyed) return;
    B = {
      stones: A.bakeStones(), pumpkin: A.bakePumpkin(), gate: A.bakeGate(), moon: A.bakeMoon(), lantern: A.bakeLantern(),
      gOrange: A.bakeGlow(255, 140, 40), gWarm: A.bakeGlow(255, 205, 130), gGreen: A.bakeGlow(124, 255, 79), gViolet: A.bakeGlow(150, 90, 255), gWhite: A.bakeGlow(255, 245, 225), gDust: A.bakeGlow(150, 138, 160, 1.6),
      fog: [A.bakeFog(1, "150,165,225"), A.bakeFog(2, "175,135,255"), A.bakeFog(3, "140,160,210")], cloud: A.bakeFog(7, "22,16,40"),
      treeL: A.bakeTree(4, false), treeR: A.bakeTree(9, true),
    };
    headA = heroWave.naturalWidth ? pixelScale(heroWave, 4) : null; headB = heroBlink.naturalWidth ? pixelScale(heroBlink, 4) : null;
    bakeBackground();
    ready = true;
  }
  let sky = null, far = null, vign = null, haze = null;
  function bakeBackground() {
    const W = Math.round(V.W);
    sky = A.bakeSky(W, VH, HY); far = A.bakeFar(W);
    vign = A.cv(W, VH); const vg = vign.getContext("2d");
    const rg = vg.createRadialGradient(W / 2, VH * 0.52, VH * 0.35, W / 2, VH * 0.52, Math.max(W, VH) * 0.72);
    rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(2,1,6,.82)"); vg.fillStyle = rg; vg.fillRect(0, 0, W, VH);
    haze = A.cv(8, 200); const hg = haze.getContext("2d"); const gr = hg.createLinearGradient(0, 0, 0, 200);
    gr.addColorStop(0, "rgba(90,60,130,0)"); gr.addColorStop(0.5, "rgba(120,80,160,.32)"); gr.addColorStop(1, "rgba(60,40,90,0)"); hg.fillStyle = gr; hg.fillRect(0, 0, 8, 200);
  }

  // ------------------------------------------------------------------ resize
  function resize() {
    const cw = root.clientWidth || innerWidth, ch = root.clientHeight || innerHeight;
    V.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(cw * V.dpr)); canvas.height = Math.max(2, Math.round(ch * V.dpr));
    V.s = canvas.height / VH; V.W = canvas.width / V.s;
    ui.style.setProperty("--u", String(ch / VH));
    if (B) bakeBackground();
    if (parts.length || stones.length) relayout(); else makeWisps();
  }
  const ro = new ResizeObserver(() => resize()); ro.observe(root);

  // ------------------------------------------------------------------ rendering
  const projX = (X, k) => V.W / 2 + (X - cam.cx) * k + cam.shx;
  const baseY = (k) => HY + cam.camH * k + cam.shy;

  const fogPat = new Map();
  function drawFog(item, t) {
    const dz = item.z - cam.zc; if (dz < 0.12) return;
    const k = 1 / dz, img = B.fog[item.i % 3];
    const fw = Math.min(1800 * k, 5000), fh = fw / 4, by = baseY(k);
    if (by - fh * 0.55 > VH || by + fh * 0.5 < 0) return;
    let pat = fogPat.get(img); if (!pat) { pat = g.createPattern(img, "repeat-x"); fogPat.set(img, pat); }
    const off = (((-cam.cx * k * 0.9 + t * 16 * k + item.i * 411) % fw) + fw) % fw, y = by - fh * 0.72;
    pat.setTransform(new DOMMatrix().translate(off, y).scale(fw / 1024, fh / 256));
    g.globalAlpha = item.a * clamp(1.5 / (0.5 + k * 0.5), 0.25, 1); g.fillStyle = pat; g.fillRect(0, y, V.W, fh); g.globalAlpha = 1;
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
      const L = s.light;
      let ox = 0, oy = (1 - rise) * swp * 0.9;
      if (R0 && R0.W === s) { const sh = (R0.t > TIMES.crack - 0.15 ? clamp((R0.t - TIMES.crack + 0.15) / 1.2, 0, 1) : 0) * (fin && fin.splitE > 0 ? 0 : 1); ox = (Math.random() - 0.5) * swp * 0.025 * sh * (reduced ? 0.3 : 1); oy += (Math.random() - 0.5) * swp * 0.012 * sh * (reduced ? 0.3 : 1); }
      const bs = swp / 240, x0 = sx + ox, yb = by + oy;
      g.globalAlpha = alpha;
      const fadeIn = fin && fin.s === s && fin.leaving ? clamp((T - fin.leaving) / 0.5, 0, 1) : 1;
      if (!hidden) {
        const bmp = won && fadeIn >= 1 ? B.stones.broken : B.stones.s[`${s.tier}${s.v}`][0];
        const lit = B.stones.s[`${s.tier}${s.v}`][1];
        const rot = swp > 18 ? s.tilt : 0;
        g.save(); g.translate(x0, yb); if (rot) g.rotate(rot);
        g.drawImage(bmp, -160 * bs, -A.GY * bs, 320 * bs, 440 * bs);
        if (L > 0.03 && !won) { g.globalAlpha = alpha * L; g.drawImage(lit, -160 * bs, -A.GY * bs, 320 * bs, 440 * bs); g.globalAlpha = alpha; }
        if (!s.decor && !won) {
          if (swp >= 40) drawName(s, swp, bs, L, alpha);
          if (swp >= 80) { requestAvatar(s); if (s.av?.ok) drawCameo(s, bs, alpha); }
        }
        g.restore();
        if (fin && fin.s === s && fin.crackP > 0 && fin.splitE <= 0) drawCrack(x0, yb, swp, s);
      }
      if (!s.decor && !won && s.tier >= 2) {
        const pw = swp * (s.tier === 2 ? 0.46 : s.tier === 3 ? 0.5 : 0.56), py = by + swp * 0.07 - pw * 0.12;
        g.globalAlpha = alpha; g.drawImage(B.pumpkin, sx + swp * 0.6 - pw / 2, py - pw * 0.8, pw, pw * 0.87);
        (adds ??= []).push(sx + swp * 0.6, py - pw * 0.4, swp, s.ph);
        if (s.tier >= 3) { const p2 = pw * 0.72; g.drawImage(B.pumpkin, sx - swp * 0.62 - p2 / 2, py - p2 * 0.78, p2, p2 * 0.87); (adds ??= []).push(sx - swp * 0.62, py - p2 * 0.38, swp * 0.8, s.ph + 2); }
      }
      if (L > 0.05 && !won) (adds ??= []).push(x0, yb - swp * 0.5, swp * 2.6 * L, -1 - L * 0.6);
      g.globalAlpha = 1;
    }
    if (sil.length) {
      g.fillStyle = row.col; g.beginPath();
      for (let i = 0; i < sil.length; i += 3) { const x = sil[i], y = sil[i + 1], w = sil[i + 2], h = w * 1.25; g.rect(x - w * 0.5, y - h + w * 0.5, w, h - w * 0.5); g.moveTo(x + w * 0.5, y - h + w * 0.5); g.arc(x, y - h + w * 0.5, w * 0.5, 0, Math.PI * 2); }
      g.fill();
    }
    if (adds) {
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < adds.length; i += 4) {
        const x = adds[i], y = adds[i + 1], w = adds[i + 2], ph = adds[i + 3];
        if (ph <= -1) { g.globalAlpha = 0.5 * (-ph - 1); const r = w; g.drawImage(B.gWarm, x - r / 2, y - r / 2, r, r); continue; }
        const fl = 0.7 + 0.2 * Math.sin(t * (3 + (ph % 3)) + ph * 7) + 0.1 * Math.sin(t * 11 + ph * 3);
        if (w < 10) { g.globalAlpha = 0.9 * fl; g.fillStyle = "#ff8a1e"; g.fillRect(x - 1, y - 2, 2.4, 2.4); g.globalAlpha = 0.25 * fl; g.drawImage(B.gOrange, x - 6, y - 7, 12, 12); }
        else { g.globalAlpha = 0.62 * fl; const r = w * 0.95; g.drawImage(B.gOrange, x - r / 2, y - r / 2, r, r); }
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
  }

  function drawName(s, swp, bs, L, alpha) {
    const meta = B.stones.meta[s.tier];
    if (!s.nameU) { g.font = '700 100px "Exo 2"'; s.nameU = Math.max(1, g.measureText(s.p.name).width / 100); }
    const fs = Math.min((0.7 * swp) / s.nameU, swp * 0.19);
    if (fs < 8) return;
    const y = -(A.GY - meta.nameY) * bs;
    g.save(); g.translate(0, y);
    g.font = `700 ${fs}px "Exo 2"`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(200,215,255,.3)"; g.fillText(s.p.name, 0, fs * 0.05 + 1.5 * (fs / 30));
    g.fillStyle = L > 0.5 ? "rgba(52,24,8,.9)" : "rgba(6,8,18,.82)"; g.fillText(s.p.name, 0, fs * 0.05);
    if (L > 0.05) { g.globalCompositeOperation = "lighter"; g.globalAlpha = alpha * L * 0.55; g.fillStyle = "#ff9d3a"; g.fillText(s.p.name, 0, fs * 0.05); }
    g.restore();
  }
  function drawCameo(s, bs, alpha) {
    const meta = B.stones.meta[s.tier], r = 34 * bs, y = -(A.GY - meta.emblemY) * bs;
    g.save(); g.beginPath(); g.arc(0, y, r, 0, Math.PI * 2); g.clip(); g.globalAlpha = alpha; g.drawImage(s.av.im, -r, y - r, r * 2, r * 2); g.restore();
    g.strokeStyle = "rgba(255,138,42,.9)"; g.lineWidth = Math.max(1.5, r * 0.1); g.beginPath(); g.arc(0, y, r, 0, Math.PI * 2); g.stroke();
  }

  const CRACK = [[0, 0], [-0.07, 0.14], [0.05, 0.27], [-0.09, 0.42], [0.06, 0.58], [-0.05, 0.74], [0.02, 0.88], [0, 1]];
  const BR = [[2, 0.14, 0.07], [3, -0.16, 0.05], [4, 0.17, 0.06], [5, -0.15, 0.08]];
  function crackPoint(sx, by, swp, sh, p) { return [sx + p[0] * swp, by - sh + p[1] * sh]; }
  function drawCrack(sx, by, swp, s) {
    const sh = (swp * A.TIER_H[s.tier - 1]) / 240, prog = fin.crackP * (CRACK.length - 1);
    g.save(); g.translate(sx, by); if (s.tilt) g.rotate(s.tilt); g.translate(-sx, -by);
    const pts = []; for (let i = 0; i < CRACK.length; i++) { if (i > prog + 1) break; const p = crackPoint(sx, by, swp, sh, CRACK[i]); if (i > prog) { const q = pts[i - 1], f = prog - (i - 1); p[0] = lerp(q[0], p[0], f); p[1] = lerp(q[1], p[1], f); } pts.push(p); }
    const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); for (const [i, du, dv] of BR) if (i < pts.length - 0.01 && pts[i]) { g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i][0] + du * swp, pts[i][1] + dv * sh); } };
    g.globalCompositeOperation = "lighter"; g.lineJoin = "round"; g.lineCap = "round";
    g.strokeStyle = "rgba(255,110,10,.55)"; g.lineWidth = Math.max(3, swp * 0.026); path(); g.stroke();
    g.strokeStyle = "rgba(255,240,170,.95)"; g.lineWidth = Math.max(1.5, swp * 0.008); path(); g.stroke();
    g.restore();
  }

  // ---- the ghost
  function drawGhost(t) {
    if (!gh.on || gh.a <= 0.01) return;
    const Z = G / Math.max(1, gh.yo - HY), X = (gh.xo - V.W / 2) * Z, dz = Z - cam.zc; if (dz < 0.06) return;
    const k = 1 / dz, sx = projX(X, k), gy = baseY(k), sy = gy - gh.alt * k;
    const u = Math.max(0.55, (LY.ws * 0.78 * k) / 100); // local unit: ghost is ~130 units tall
    const lean = gh.lean;
    // ground pool + cone
    const ws = LY.ws, rx = 2.0 * ws * k, ry = rx * 0.3;
    g.globalCompositeOperation = "lighter";
    const lit = R0 && R0.t > TIMES.sweepEnd && R0.t < TIMES.fakeEnd ? 0.8 + Math.sin(t * 22) * 0.2 * sstep(0.3, 1, (R0.t - TIMES.sweepEnd) / 1.5) : 1;
    g.globalAlpha = 0.62 * gh.a * lit; g.drawImage(B.gWarm, sx - rx, gy - ry, rx * 2, ry * 2);
    g.globalAlpha = 0.5 * gh.a * lit; g.drawImage(B.gOrange, sx - rx * 0.45, gy - ry * 0.45, rx * 0.9, ry * 0.9);
    const lx = sx - 66 * u, ly = sy + 36 * u + Math.sin(t * 3) * 2;
    const cg = g.createLinearGradient(0, ly, 0, gy); cg.addColorStop(0, "rgba(255,215,140,.32)"); cg.addColorStop(0.7, "rgba(255,170,70,.1)"); cg.addColorStop(1, "rgba(255,160,60,0)");
    g.globalAlpha = gh.a * lit; g.fillStyle = cg; g.beginPath(); g.moveTo(lx - 5 * u, ly); g.lineTo(lx + 5 * u, ly); g.lineTo(sx + rx * 0.8, gy); g.lineTo(sx - rx * 0.8, gy); g.closePath(); g.fill();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;

    g.save(); g.translate(sx, sy + Math.sin(t * 2.6) * 4 * u); g.rotate(lean * 0.2); g.scale(u, u); g.globalAlpha = gh.a;
    g.globalCompositeOperation = "lighter"; g.globalAlpha = gh.a * 0.55; g.drawImage(B.gViolet, -150, -150, 300, 300); g.globalAlpha = gh.a * 0.25; g.drawImage(B.gGreen, -110, -100, 220, 220);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = gh.a * 0.96;
    // sheet
    const sw = Math.sin(t * 6) , tail = -lean * 26;
    g.beginPath(); g.moveTo(-36, -30); g.bezierCurveTo(-36, -80, 36, -80, 36, -30);
    g.bezierCurveTo(46, -4, 56 + tail * 0.4, 26, 60 + tail, 58 + sw * 3);
    const n = 6; for (let i = 0; i < n; i++) { const x1 = lerp(60, -60, (i + 0.5) / n) + tail, x2 = lerp(60, -60, (i + 1) / n) + tail * (1 - (i + 1) / n * 0.2); g.quadraticCurveTo(x1, 80 + Math.sin(t * 7 + i * 1.7) * 7 + (i % 2) * 6, x2, 58 + Math.sin(t * 6 + i * 2) * 4); }
    g.bezierCurveTo(-56 + tail * 0.4, 26, -46, -4, -36, -30); g.closePath();
    const sg = g.createLinearGradient(-50, -60, 40, 70); sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.55, "#dfe6ff"); sg.addColorStop(1, "#aab4e6");
    g.fillStyle = sg; g.fill(); g.strokeStyle = "rgba(190,205,255,.65)"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "rgba(120,130,200,.18)"; g.beginPath(); g.ellipse(24, 20, 18, 46, 0.2, 0, 7); g.fill();
    // arms
    g.strokeStyle = "#f2f5ff"; g.lineWidth = 14; g.lineCap = "round";
    g.beginPath(); g.moveTo(-34, -2); g.quadraticCurveTo(-52, 6, -62, 22); g.stroke();
    g.beginPath(); g.moveTo(34, -2); g.quadraticCurveTo(54, -6 - sw * 3, 64, -22 + sw * 5); g.stroke();
    // face hollow + mascot
    g.fillStyle = "#08060f"; g.beginPath(); g.ellipse(0, -28, 29, 28, 0, 0, 7); g.fill();
    const head = gh.blink > 0 && headB ? headB : headA;
    if (head) {
      g.save(); g.beginPath(); g.ellipse(0, -28, 28, 27, 0, 0, 7); g.clip();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      const su = 1.8, an = head === headB ? [32, 17] : [39, 17]; g.drawImage(head, -an[0] * su, -28 - an[1] * su, (head.width / 4) * su, (head.height / 4) * su); g.restore();
    }
    g.strokeStyle = "#f6f8ff"; g.lineWidth = 7; g.beginPath(); g.ellipse(0, -28, 31, 30, 0, 0, 7); g.stroke();
    g.strokeStyle = "rgba(120,130,200,.4)"; g.lineWidth = 2; g.beginPath(); g.ellipse(0, -28, 27.5, 26.5, 0, 0, 7); g.stroke();
    // lantern
    g.drawImage(B.lantern, -66 - 14, 22, 28, 45);
    g.globalCompositeOperation = "lighter"; g.globalAlpha = gh.a * 0.9 * lit; g.drawImage(B.gWarm, -66 - 70, 44 - 70, 140, 140);
    g.restore(); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
  }

  function drawTrail(t, dt) {
    g.globalCompositeOperation = "lighter";
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]; p.life += dt; if (p.life > 1.1) { trail.splice(i, 1); continue; }
      const dz = p.Z - cam.zc; if (dz < 0.06) continue; const k = 1 / dz;
      const x = projX(p.X, k), y = baseY(k) - (p.A + p.life * LY.ws * 0.25) * k, r = Math.max(2, LY.ws * 0.11 * k) * (1 - p.life / 1.1);
      g.globalAlpha = 0.5 * (1 - p.life / 1.1); g.drawImage(p.col[0] === "1" && p.col[1] === "2" ? B.gGreen : B.gViolet, x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  function drawWisps(t) {
    g.globalCompositeOperation = "lighter";
    for (const w of wisps) {
      const Z = G / Math.max(1, w.yo - HY), dz = Z - cam.zc; if (dz < 0.06) continue; const k = 1 / dz;
      const x = projX((w.xo - V.W / 2) * Z, k) + Math.sin(t * 2 + w.ph) * 8 * k * 0.5, y = baseY(k) - (LY.ws * 0.9 + Math.sin(t * 1.6 + w.ph) * LY.ws * 0.1) * k;
      const r = Math.max(10, LY.ws * 0.28 * k);
      g.globalAlpha = 0.9; g.drawImage(B.gGreen, x - r, y - r, r * 2, r * 2); g.globalAlpha = 0.9; g.drawImage(B.gWhite, x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.5);
    }
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    // name tags on small stones
    for (const w of wisps) {
      if (!w.tgt || w.tag < 0.05) continue; const s = w.tgt, dz = s.z - cam.zc; if (dz < 0.06) continue;
      const k = 1 / dz, swp = s.sw * k; if (swp >= 70 || !s.p) continue;
      const x = projX(s.x, k), y = baseY(k) - (swp * (A.TIER_H[s.tier - 1] / 240) + swp * 0.45) - 8;
      const fs = clamp(22, 18, 26); g.font = `700 ${fs}px "Exo 2"`;
      const label = s.p.name, tw = g.measureText(label).width + 26;
      g.globalAlpha = w.tag; g.fillStyle = "rgba(12,10,20,.86)"; g.strokeStyle = "rgba(124,255,79,.8)"; g.lineWidth = 2;
      g.beginPath(); g.roundRect(x - tw / 2, y - fs * 0.95, tw, fs * 1.55, 12); g.fill(); g.stroke();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, x, y - fs * 0.15);
      g.globalAlpha = 1;
    }
  }

  // ---- finale: halves, hand, sign
  function drawFinale(t, dt) {
    if (!fin) return;
    const s = fin.s, dz = s.z - cam.zc; if (dz < 0.045) return;
    let fa = 1; if (fin.leaving) { fa = 1 - clamp((T - fin.leaving) / 0.6, 0, 1); if (fa <= 0) { fin = null; return; } }
    const k = 1 / dz, sx = projX(s.x, k), by = baseY(k), swp = s.sw * k, bs = swp / 240, sh = (swp * A.TIER_H[s.tier - 1]) / 240;
    { const spot = sstep(0, 1, (R0 ? R0.t - TIMES.crack + 0.3 : 3) / 1.2) * fa, rg = g.createRadialGradient(sx, by - sh * 0.5, swp * 0.6, sx, by - sh * 0.5, Math.max(V.W, VH) * 0.62); rg.addColorStop(0, "rgba(4,2,10,0)"); rg.addColorStop(1, `rgba(4,2,10,${0.62 * spot})`); g.fillStyle = rg; g.fillRect(0, 0, V.W, VH); }
    g.globalAlpha = fa;
    const bmp = B.stones.s[`${s.tier}${s.v}`][0];
    if (fin.splitE > 0) {
      const e = fin.splitE, ang = 0.3 * e, open = swp * 0.42 * e;
      const crackAt = (i) => crackPoint(sx, by, swp, sh, CRACK[i]);
      // dark gap and inner glow
      g.save(); g.beginPath(); const top = crackAt(0); g.moveTo(top[0], top[1] - swp * 0.01);
      for (let i = 1; i < CRACK.length; i++) { const p = crackAt(i); g.lineTo(p[0] + open * 0.5, p[1]); } for (let i = CRACK.length - 1; i >= 0; i--) { const p = crackAt(i); g.lineTo(p[0] - open * 0.5, p[1]); } g.closePath();
      g.fillStyle = "#07060b"; g.fill(); g.restore();
      // beam
      if (fin.beam > 0.01) { g.globalCompositeOperation = "lighter"; const bw = swp * 0.9, bg = g.createLinearGradient(0, by, 0, by - VH * 0.9); bg.addColorStop(0, `rgba(255,150,50,${0.55 * fin.beam})`); bg.addColorStop(0.5, `rgba(124,255,79,${0.16 * fin.beam})`); bg.addColorStop(1, "rgba(124,255,79,0)"); g.fillStyle = bg; g.fillRect(sx - bw / 2, by - VH * 0.9, bw, VH * 0.9); g.drawImage(B.gOrange, sx - swp * 0.9, by - swp * 0.5, swp * 1.8, swp); g.globalCompositeOperation = "source-over"; }
      // halves
      for (const side of [-1, 1]) {
        g.save(); g.globalAlpha = fa;
        const pv = [sx + side * swp * 0.5, by];
        g.translate(pv[0] + side * open, pv[1] + e * sh * 0.05); g.rotate(side * ang); g.translate(-pv[0], -pv[1]);
        g.beginPath(); g.moveTo(sx + side * swp * 0.9, by - sh * 1.3);
        for (let i = 0; i < CRACK.length; i++) { const p = crackAt(i); g.lineTo(p[0], p[1] - (i === 0 ? sh * 0.2 : 0) * 0 - (i === 0 ? 0 : 0)); }
        g.lineTo(sx + side * swp * 0.9, by); g.closePath(); g.clip();
        g.drawImage(bmp, sx - 160 * bs, by - A.GY * bs, 320 * bs, 440 * bs); g.restore();
      }
      // hand + sign
      drawHandSign(sx, by, swp, sh, t, fa);
      // earth strip in front
      g.save(); g.beginPath(); g.rect(sx - swp * 1.2, by, swp * 2.4, swp * 0.5); g.clip(); g.drawImage(B.stones.s[`${s.tier}${s.v}`][0], sx - 160 * bs, by - A.GY * bs, 320 * bs, 440 * bs); g.restore();
      if (R0 && R0.burst) { R0.burst = false; puff(sx, by - sh * 0.5, 70, { sp: 520, spread: 3.4, w: swp * 0.3, col: "190,175,160", r: swp * 0.03, life: 1.6, ay: 120 }); puff(sx, by - sh * 0.4, 60, { sp: 420, add: true, col: "255,150,40", r: 5, life: 1.8, ay: -120, spread: 2.2 }); puff(sx, by - sh * 0.4, 40, { sp: 380, add: true, col: "124,255,79", r: 4, life: 1.8, ay: -100, spread: 2.6 }); }
    }
    g.globalAlpha = 1;
    if (!reduced || true) {
      // embers rise around the sign
      if (fin.splitE > 0.2 && Math.random() < dt * 40) puff(sx + (Math.random() - 0.5) * swp * 1.4, by - sh * 0.3, 1, { sp: 60, dir: -Math.PI / 2, spread: 0.8, add: true, col: Math.random() < 0.6 ? "255,150,40" : "124,255,79", r: 3.5, life: 2.6, ay: -40 });
    }
  }

  function drawHandSign(sx, by, swp, sh, t, fa) {
    const p = fin.p, he = fin.handE; if (he <= 0) return;
    const pw0 = Math.max(0.065 * swp, 4);
    const ph = 0.62 * swp;
    // text metrics
    g.font = '800 100px "Exo 2"'; const nameU = g.measureText(p.name).width / 100;
    const sub = `${p.handle ? p.handle + "  ·  " : ""}${p.tickets} ${plural(p.tickets)}`;
    const pd = ph * 0.74, pad = ph * 0.13;
    let pw = Math.max(1.9 * swp, pd + pad * 3 + nameU * ph * 0.34); pw = Math.min(pw, V.W * 0.9);
    const avail = pw - pd - pad * 3, fs = Math.min(ph * 0.4, avail / nameU), fs2 = Math.min(fs * 0.4, avail / (g.measureText(sub).width / 100 || 1) * 0.0 + fs * 0.4);
    const rise = (1 - he) * (sh * 0.95 + ph);
    const plankCY = -(sh * 0.62 + ph * 0.5);
    g.save(); g.beginPath(); g.rect(0, 0, V.W, by + swp * 0.03); g.clip();
    g.translate(sx, by + rise);
    // pole
    const pg = g.createLinearGradient(-pw0, 0, pw0, 0); pg.addColorStop(0, "#6b4a28"); pg.addColorStop(1, "#2c1b0c");
    g.fillStyle = pg; g.fillRect(-pw0 / 2, plankCY, pw0, -plankCY + sh * 0.5);
    // forearm + fist
    const fy = -sh * 0.26, fw = pw0 * 2.7, fh = pw0 * 3.2;
    g.fillStyle = "#3a2a4d"; g.beginPath(); g.moveTo(-fw * 0.52, fy + fh * 0.5); g.lineTo(fw * 0.52, fy + fh * 0.5); g.lineTo(fw * 0.62, sh * 0.5); g.lineTo(-fw * 0.62, sh * 0.5); g.closePath(); g.fill();
    g.fillStyle = "#9bb98a"; g.strokeStyle = "#1c2a1a"; g.lineWidth = Math.max(2, swp * 0.01);
    g.beginPath(); g.moveTo(-fw * 0.38, fy + fh * 0.62); g.lineTo(-fw * 0.5, fy + fh * 0.1); g.lineTo(fw * 0.5, fy + fh * 0.1); g.lineTo(fw * 0.38, fy + fh * 0.62); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(-fw * 0.55, fy - fh * 0.42, fw * 1.1, fh * 0.62, fw * 0.14); g.fill(); g.stroke();
    g.strokeStyle = "#1c2a1a"; g.lineWidth = Math.max(1.5, swp * 0.007); g.beginPath(); for (let i = 1; i < 4; i++) { const x = -fw * 0.55 + (fw * 1.1 * i) / 4; g.moveTo(x, fy - fh * 0.4); g.lineTo(x, fy + fh * 0.14); } g.stroke();
    g.fillStyle = "#adc79b"; g.beginPath(); g.roundRect(fw * 0.5, fy - fh * 0.22, fw * 0.3, fh * 0.34, fw * 0.1); g.fill(); g.stroke();
    g.fillStyle = "#4a6a46"; for (const [dx, w2] of [[-0.35, 0.18], [0.1, 0.14]]) g.fillRect(fw * dx, fy - fh * 0.38, fw * w2, fh * 0.1);
    // plank
    g.save(); g.translate(0, plankCY); g.rotate(Math.sin(t * 1.5) * 0.018 * Math.min(1, he));
    const wg = g.createLinearGradient(0, -ph / 2, 0, ph / 2); wg.addColorStop(0, "#7b5230"); wg.addColorStop(0.5, "#5a3a1f"); wg.addColorStop(1, "#3a230f");
    g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = swp * 0.06; g.shadowOffsetY = swp * 0.02;
    g.fillStyle = wg; g.beginPath(); g.roundRect(-pw / 2, -ph / 2, pw, ph, ph * 0.08); g.fill(); g.shadowColor = "transparent";
    g.strokeStyle = "rgba(20,10,4,.6)"; g.lineWidth = Math.max(1.5, ph * 0.012); for (const y of [-0.17, 0.17]) { g.beginPath(); g.moveTo(-pw / 2 + 4, y * ph); g.lineTo(pw / 2 - 4, y * ph); g.stroke(); }
    g.strokeStyle = "#ff6600"; g.lineWidth = Math.max(3, ph * 0.03); g.beginPath(); g.roundRect(-pw / 2 + ph * 0.05, -ph / 2 + ph * 0.05, pw - ph * 0.1, ph - ph * 0.1, ph * 0.05); g.stroke();
    g.fillStyle = "#cdb98a"; for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(x * (pw / 2 - ph * 0.11), y * (ph / 2 - ph * 0.11), ph * 0.022, 0, 7); g.fill(); }
    // portrait
    const cxp = -pw / 2 + pad * 1.4 + pd / 2;
    g.save(); g.beginPath(); g.arc(cxp, 0, pd / 2, 0, Math.PI * 2); g.clip();
    if (fin.s.av?.ok) g.drawImage(fin.s.av.im, cxp - pd / 2, -pd / 2, pd, pd);
    else {
      const bg = g.createRadialGradient(cxp, -pd * 0.2, pd * 0.05, cxp, 0, pd * 0.6); bg.addColorStop(0, "#6a3cc0"); bg.addColorStop(1, "#1d1033"); g.fillStyle = bg; g.fillRect(cxp - pd / 2, -pd / 2, pd, pd);
      g.fillStyle = "#fff4dc"; g.font = `900 ${pd * 0.55}px "Exo 2"`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText((p.name || "?").trim().charAt(0).toUpperCase(), cxp, pd * 0.04);
      g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.3; g.drawImage(B.gOrange, cxp - pd / 2, pd * 0.05, pd, pd * 0.55); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    }
    g.restore();
    g.strokeStyle = "#ff8a2a"; g.lineWidth = Math.max(3, pd * 0.05); g.beginPath(); g.arc(cxp, 0, pd / 2, 0, Math.PI * 2); g.stroke();
    // text
    const tx = cxp + pd / 2 + pad * 1.2, tw = pw / 2 - pad * 1.2 - tx;
    g.textAlign = "left"; g.textBaseline = "middle";
    const hasSub = true, ny = hasSub ? -fs * 0.32 : 0;
    g.font = `800 ${fs}px "Exo 2"`; g.lineJoin = "round"; g.lineWidth = fs * 0.14; g.strokeStyle = "#2a1406"; g.strokeText(p.name, tx, ny);
    g.shadowColor = "rgba(255,120,20,.65)"; g.shadowBlur = fs * 0.35; g.fillStyle = "#fff4dc"; g.fillText(p.name, tx, ny); g.shadowColor = "transparent"; g.shadowBlur = 0;
    let f2 = fs2; g.font = `700 ${f2}px "Exo 2"`; const w2 = g.measureText(sub).width; if (w2 > tw) { f2 *= tw / w2; g.font = `700 ${f2}px "Exo 2"`; }
    g.fillStyle = "#7cff4f"; g.fillText(sub, tx, fs * 0.5 + f2 * 0.15);
    g.restore(); g.restore();
  }

  function drawBats(t) {
    g.fillStyle = "#050409";
    for (let i = 0; i < 5; i++) {
      const sp = 38 + i * 9, x = ((t * sp + i * 420) % (V.W + 300)) - 150, y = 120 + i * 46 + Math.sin(t * 0.7 + i * 2) * 40, w = 15 + (i % 3) * 4, fl = Math.sin(t * (13 + i)) * 0.8;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - w * 0.6, y - w * (0.8 + fl), x - w * 1.5, y - w * 0.1 + fl * w * 0.5);
      g.quadraticCurveTo(x - w * 0.8, y + w * 0.1, x, y + w * 0.5); g.quadraticCurveTo(x + w * 0.8, y + w * 0.1, x + w * 1.5, y - w * 0.1 + fl * w * 0.5);
      g.quadraticCurveTo(x + w * 0.6, y - w * (0.8 + fl), x, y); g.fill();
    }
  }

  function render(dt) {
    const W = V.W; const t = T;
    g.setTransform(V.s, 0, 0, V.s, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (!ready) { g.fillStyle = "#0a0912"; g.fillRect(0, 0, W, VH); return; }
    const lat = -(cam.cx / cam.Zf) * 0.0 - ((cam.cx / cam.Zf)) * 1;
    g.drawImage(sky, 0, 0, W, VH);
    // moon + clouds
    const mx = W * 0.2 + lat * 0.05, my = 205;
    g.drawImage(B.moon, mx - 320, my - 320 + Math.sin(t * 0.2) * 3, 640, 640);
    g.globalAlpha = 0.9; for (let i = 0; i < 2; i++) { const cw = 1100, off = (((t * (9 + i * 5) + i * 600) % (cw + W * 0.6)) - cw); g.drawImage(B.cloud, mx - W * 0.3 + off, my - 120 + i * 70, cw, cw / 4); } g.globalAlpha = 1;
    drawBats(t);
    if (lightning > 0) { g.fillStyle = `rgba(190,170,255,${0.16 * lightning})`; g.fillRect(0, 0, W, HY + 20); }
    // far ridge
    g.drawImage(far, (W - far.width) / 2 + lat * 0.18, HY - far.height + 8);
    // gate
    { const Zg = LY.Zgate, dz = Zg - cam.zc; if (dz > 0.1) { const k = 1 / dz, gw = 520 * Zg * k, gx = projX(0, k), gyb = baseY(k); g.drawImage(B.gate, gx - gw / 2, gyb - gw * (360 / 520) + gw * 0.02, gw, gw * (360 / 520)); } }
    g.drawImage(haze, 0, HY - 70, W, 200);
    // rows back to front
    for (const it of drawList) { if (it.fog) drawFog(it, t); else drawRow(it.row, t); }
    drawTrail(t, dt);
    drawFinale(t, dt);
    drawGhost(t);
    drawWisps(t);
    // particles
    for (let i = parts_fx.length - 1; i >= 0; i--) {
      const p = parts_fx[i]; p.life += dt; if (p.life >= p.max) { parts_fx.splice(i, 1); continue; }
      p.vy += p.ay * dt; p.vx *= 1 - dt * 0.8; p.x += p.vx * dt; p.y += p.vy * dt;
      const f = 1 - p.life / p.max;
      if (p.add) { g.globalCompositeOperation = "lighter"; g.globalAlpha = f; g.fillStyle = `rgb(${p.col})`; g.beginPath(); g.arc(p.x, p.y, p.r * (0.5 + f * 0.5), 0, 7); g.fill(); g.globalCompositeOperation = "source-over"; }
      else { const r = p.r * (2.6 - f); g.globalAlpha = f * 0.42; g.drawImage(B.gDust, p.x - r, p.y - r, r * 2, r * 2); }
    }
    g.globalAlpha = 1;
    // foreground: trees, near fog, vignette
    g.globalAlpha = 0.96;
    g.drawImage(B.treeL, -110 + lat * 0.05, 0, 760, VH); g.drawImage(B.treeR, W - 650 - lat * 0.05, 0, 760, VH);
    g.globalAlpha = 0.2;
    for (let i = 0; i < 2; i++) { const fw = 2000, off = (((t * (12 + i * 7) - cam.cx * 0.1 + i * 700) % fw) + fw) % fw; for (let x = off - fw; x < W; x += fw) g.drawImage(B.fog[(i + 1) % 3], x, VH - 230 - i * 40, fw + 1, fw / 4 * 0.9); }
    g.globalAlpha = 1;
    g.drawImage(vign, 0, 0, W, VH);
    if (R0 && R0.t < 1.3 && !reduced) { g.fillStyle = `rgba(20,0,40,${0.18 * (1 - R0.t / 1.3)})`; g.fillRect(0, 0, W, VH); }
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
