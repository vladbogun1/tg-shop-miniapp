// Visual "roulette": CS-style case opening, Halloween edition, in the 16-bit look of the OBS overlays.
// Idle: the night graveyard (assets/scenes/bg-night), a wall of cards (rarity by tickets) + square embers
// for everybody else, pixel bats, the mascot. Roll: a horizontal strip of participant cards that accelerates,
// ticks, brakes, fake-stops on the neighbour and creeps onto the winner chosen by the server.
// Finale: the card flies forward, pixel rays and bursts, the name huge in the pixel font.
import * as px from "../pixel-kit.js";

export const meta = { id: "roulette", title: "Кейс-рулетка", author: "agent" };

const W = 1920, H = 1080;
const { PAL } = px;
const P = px.PX;

// rarity colours from the scene palette (stone, slime, violet, pumpkin, gold)
const RAR = [
  { n: "ЗВИЧАЙНА", c: "#a59cb8" },
  { n: "РІДКІСНА", c: "#7cff4f" },
  { n: "ЕПІЧНА", c: "#a46bff" },
  { n: "МІФІЧНА", c: "#ff6600" },
  { n: "ЛЕГЕНДАРНА", c: "#ffd36b" },
];
const rarOf = (t) => Math.max(0, Math.min(4, (t | 0) - 1));
const plural = px.ticketsWord;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeInOutQuad = (t) => { t = clamp(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const easeOutBack = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rnd = (a, b) => a + Math.random() * (b - a);
/** Quantize a 0..1 fade to n hard steps, like the steps() animations of the overlays. */
const stepped = (t, n = 6) => Math.round(clamp(t) * n) / n;

// ---------------------------------------------------------------- sprites (pre-rendered once, low-res)
/** A jack-o'-lantern body drawn at art-pixel resolution (40×38), shown upscaled nearest. */
function makePumpkin() {
  const c = px.canvas(40, 38), g = c.getContext("2d");
  const lobe = (cx, rx, ry, c0, c1) => {
    g.fillStyle = c1; g.beginPath(); g.ellipse(cx, 22, rx, ry, 0, 0, 7); g.fill();
    g.fillStyle = c0; g.beginPath(); g.ellipse(cx - rx * 0.2, 20, rx * 0.62, ry * 0.75, 0, 0, 7); g.fill();
  };
  lobe(10, 9, 12, "#ff7a14", "#a83200");
  lobe(30, 9, 12, "#ff7a14", "#a83200");
  lobe(15, 9, 14, "#ff8f2a", "#c23e00");
  lobe(25, 9, 14, "#ff8f2a", "#c23e00");
  lobe(20, 8, 15, "#ffa83f", "#d94a00");
  g.fillStyle = "#2f7a1c"; g.fillRect(18, 2, 4, 7); g.fillStyle = "#7cff4f"; g.fillRect(19, 2, 2, 3); g.fillRect(22, 1, 4, 2);
  g.fillStyle = "#ffffff30"; g.fillRect(13, 13, 2, 6);
  // hard alpha: no half-transparent anti-aliased rim
  const im = g.getImageData(0, 0, 40, 38);
  for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] > 110 ? 255 : 0;
  g.putImageData(im, 0, 0);
  // ink outline
  const out = px.canvas(40, 38), o = out.getContext("2d");
  o.filter = "none";
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) o.drawImage(c, dx, dy);
  o.globalCompositeOperation = "source-in"; o.fillStyle = PAL.ink; o.fillRect(0, 0, 40, 38);
  o.globalCompositeOperation = "source-over"; o.drawImage(c, 0, 0);
  return out;
}

// ---------------------------------------------------------------- mount
export function mount(root, ctx) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated";
  root.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });
  const reduced = () => !!ctx.reducedMotion;
  const avatarsOn = () => ctx.privacy?.avatars !== false;
  const snd = (n) => { try { ctx.sound?.(n); } catch { /* sound must never break the show */ } };

  const pumpkin = makePumpkin();
  const night = px.loadImage(px.sceneUrl("bg-night"));
  const host = px.loadImage(px.spriteUrl("host"));
  const back = px.lowres(W, H); // bats
  const fx = px.lowres(W, H);   // rays of the finale
  px.ensureFont().then(() => { cardCache.clear(); });

  // canvas geometry
  let S = 1, OX = 0, OY = 0, CW = 1920, CH = 1080, DPR = 1;
  function fit() {
    const w = root.clientWidth || ctx.size?.w || innerWidth, h = root.clientHeight || ctx.size?.h || innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CW = Math.round(w * DPR); CH = Math.round(h * DPR);
    canvas.width = CW; canvas.height = CH;
    S = Math.min(CW / W, CH / H); OX = (CW - W * S) / 2; OY = (CH - H * S) / 2;
    g.imageSmoothingEnabled = false;
    cardCache.clear();
    layoutWall();
  }

  // ---------------------------------------------------------------- avatars
  const imgs = new Map();
  function avatarOf(p) {
    if (!avatarsOn() || !p.avatar) return null;
    let e = imgs.get(p.avatar);
    if (!e) {
      e = { img: new Image(), ok: false };
      e.img.referrerPolicy = "no-referrer";
      e.img.onload = () => { e.ok = true; };
      e.img.onerror = () => { e.bad = true; };
      e.img.src = p.avatar;
      imgs.set(p.avatar, e);
    }
    return e.ok ? e.img : null;
  }

  // ---------------------------------------------------------------- card bitmaps (cached)
  const cardCache = new Map();
  function cardBitmap(p, w, mode = "name") {
    const av = avatarOf(p);
    const key = `${p.id}|${Math.round(w)}|${mode}|${S.toFixed(3)}|${av ? 1 : 0}`;
    let c = cardCache.get(key);
    if (c) return c;
    if (cardCache.size > 600) cardCache.clear();
    c = renderCard(p, w, mode, av);
    cardCache.set(key, c);
    return c;
  }
  // The card bitmap has a margin of 3 art pixels around the body for the frame and its outline.
  const M = 3 * P;
  function renderCard(p, w, mode, av) {
    w = px.snap(w); const h = px.snap(w * 4 / 3);
    const c = px.canvas((w + 2 * M) * S, (h + 2 * M + 2 * P) * S), gg = c.getContext("2d");
    gg.imageSmoothingEnabled = false;
    gg.scale(S, S); gg.translate(M, M);
    const rr = rarOf(p.tickets), R = RAR[rr];
    px.box(gg, 0, 0, w, h, { frame: R.c, fill: PAL.plum, shadow: false });
    // art window: a darker square with a hard band of the rarity colour at its foot
    const aw = px.snap(w * 0.62), ax = px.snap((w - aw) / 2), ay = px.snap(h * 0.08);
    gg.fillStyle = PAL.ink; gg.fillRect(ax, ay, aw, aw);
    gg.fillStyle = R.c; gg.globalAlpha = 0.22; gg.fillRect(ax, ay + aw * 0.66, aw, aw * 0.34); gg.globalAlpha = 0.4; gg.fillRect(ax, ay + aw * 0.86, aw, aw * 0.14); gg.globalAlpha = 1;
    let drew = false;
    if (av) {
      const s = aw - 4 * P;
      try { drew = px.photo(gg, av, ax + 2 * P, ay + 2 * P, s, P * 2); } catch { drew = false; }
      if (drew) px.ring(gg, ax + 2 * P, ay + 2 * P, s, s, R.c);
    }
    if (!drew) {
      const pw = 40 * Math.max(2, Math.floor(aw * 0.84 / 40)), ph = pw * 38 / 40;
      gg.drawImage(pumpkin, px.snap(ax + (aw - pw) / 2), px.snap(ay + (aw - ph) / 2 + P), pw, ph);
      const ch = ([...(p.name || "?").trim()][0] || "?").toUpperCase();
      px.text(gg, ch, ax + aw / 2, ay + aw * 0.58, { size: px.snap(w * 0.22), color: PAL.gold, ink: "#3a1100", drop: null, align: "center" });
    }
    // texts
    const maxW = w - 6 * P, cx = w / 2;
    if (mode === "hero") {
      const fs = px.fit(gg, R.n, px.snap(w * 0.11), maxW);
      px.text(gg, R.n, cx, h * 0.72, { size: fs, color: R.c, align: "center" });
    } else {
      const fs = px.fit(gg, p.name, px.snap(w * 0.13), maxW);
      px.text(gg, p.name, cx, h * (p.handle ? 0.67 : 0.71), { size: fs, color: PAL.bone, align: "center" });
      if (p.handle) {
        const fh = px.fit(gg, p.handle, px.snap(w * 0.08), maxW, 400);
        px.text(gg, p.handle, cx, h * 0.765, { size: fh, weight: 400, color: PAL.amber, align: "center", depth: P / 2 });
      }
    }
    // bottom stripe: solid rarity colour with a darker step on top
    const sy = px.snap(h * 0.85);
    gg.fillStyle = PAL.ink; gg.fillRect(0, sy - P, w, P);
    gg.fillStyle = R.c; gg.fillRect(0, sy, w, h - sy);
    gg.fillStyle = "rgba(0,0,0,.25)"; gg.fillRect(0, h - P, w, P);
    px.text(gg, `${p.tickets} ${plural(p.tickets)}`, cx, sy + (h - sy) / 2, { size: px.snap(w * 0.075), color: PAL.ink, ink: false, align: "center" });
    return c;
  }

  // ---------------------------------------------------------------- state
  let participants = [];
  const localWon = new Set();
  let tiles = [];           // wall tiles
  let swarm = [];           // ember dots for everybody not on the wall
  let wallCap = 24;
  let mode = "idle";        // idle | strip | win
  let idleIn = 1;           // 0..1 fade of the wall after reset
  let rollState = null;
  let particles = [];
  let rings = [];
  let flash = 0, shake = 0;
  let nextSwapAt = 0;
  let raf = 0, last = performance.now() / 1000, destroyed = false;
  const bats = Array.from({ length: 5 }, (_, i) => ({ x: rnd(-200, W + 200), y: rnd(160, 520), s: rnd(0.6, 1.1), vx: (Math.random() < 0.5 ? -1 : 1) * rnd(70, 150), ph: rnd(0, 7), wob: rnd(0.4, 1), i }));

  const pool = () => participants.filter((p) => !p.won && !localWon.has(p.id));

  function sampleWeighted(list, k) {
    const keyed = list.map((p) => ({ p, k: Math.pow(Math.random(), 1 / Math.max(1, p.tickets)) }));
    keyed.sort((a, b) => b.k - a.k);
    return keyed.slice(0, k).map((x) => x.p);
  }

  function layoutWall() {
    const T = tiles.length;
    if (!T) return;
    const RX = 120, RY = 236, RW = W - 240, RH = 680, gap = 32, cap = 248;
    let best = { w: 0, c: 1 };
    for (let c = 1; c <= T; c++) {
      const rows = Math.ceil(T / c);
      const w = Math.min((RW - (c - 1) * gap) / c, (RH - (rows - 1) * gap) / (rows * 4 / 3), cap);
      if (w > best.w + 0.5) best = { w, c };
    }
    const w = Math.floor(best.w / P) * P, c = best.c, h = w * 4 / 3, rows = Math.ceil(T / c);
    const top = RY + (RH - (rows * h + (rows - 1) * gap)) / 2;
    tiles.forEach((t, i) => {
      const r = Math.floor(i / c), inRow = r === rows - 1 ? T - r * c : c;
      const k = i - r * c;
      const rowW = inRow * w + (inRow - 1) * gap;
      t.w = w; t.h = h;
      t.x = RX + (RW - rowW) / 2 + k * (w + gap) + w / 2;
      t.y = top + r * (h + gap) + h / 2;
    });
  }

  function rebuildSwarm() {
    const onWall = new Set(tiles.map((t) => t.p.id));
    const rest = pool().filter((p) => !onWall.has(p.id));
    const list = rest.length > 420 ? sampleWeighted(rest, 420) : rest;
    swarm = list.map((p) => ({
      p, x: rnd(0, W), y: rnd(0, H), vy: -rnd(8, 30), ph: rnd(0, 7), sp: rnd(0.6, 1.8), amp: rnd(8, 36),
      sz: rarOf(p.tickets) >= 3 ? 3 * P : rarOf(p.tickets) >= 1 ? 2 * P : P, rar: rarOf(p.tickets),
    }));
  }

  function rebuildWall(now) {
    const pl = pool();
    const keep = tiles.filter((t) => pl.includes(t.p));
    const keptIds = new Set(keep.map((t) => t.p.id));
    // refresh object references (list may have been replaced)
    const byId = new Map(pl.map((p) => [p.id, p]));
    keep.forEach((t) => { t.p = byId.get(t.p.id); });
    const need = Math.min(wallCap, pl.length) - keep.length;
    const fresh = need > 0 ? sampleWeighted(pl.filter((p) => !keptIds.has(p.id)), need) : [];
    const list = keep.slice(0, Math.min(wallCap, pl.length));
    fresh.forEach((p, i) => list.push({ p, born: now + 0.15 + i * 0.05, swap: null, ph: rnd(0, 7) }));
    tiles = list;
    layoutWall();
    rebuildSwarm();
  }

  // ---------------------------------------------------------------- drawing helpers
  const text = (str, x, y, o) => px.text(g, str, x, y, o);
  const textW = (str, size, weight = 700, ls = 0) => px.measure(g, str, size, weight, ls);
  function drawCardAt(p, w, cx, cy, o = {}) {
    const bm = cardBitmap(p, w, o.mode || "name");
    const sc = o.scale ?? 1, sx = o.sx ?? 1;
    const bw = bm.width / S, bh = bm.height / S;
    g.save();
    g.globalAlpha = o.alpha ?? 1;
    g.translate(px.snap(cx), px.snap(cy)); g.scale(sc * sx, sc);
    g.drawImage(bm, -bw / 2, -(bh - 2 * P) / 2, bw, bh);
    g.restore();
  }

  // ---------------------------------------------------------------- scenes
  function drawBackground(now, busy) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.fillStyle = PAL.ink; g.fillRect(0, 0, CW, CH);
    g.setTransform(S, 0, 0, S, OX, OY);
    px.cover(g, night, 0, 0, W, H);
    // a darker stage in the middle while a case is opened, stepped bands instead of a soft gradient
    const d = busy ? 0.55 : 0.18;
    g.fillStyle = PAL.ink;
    g.globalAlpha = d; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.55; g.fillRect(0, 984, W, 96);
    g.globalAlpha = 0.35; g.fillRect(0, 968, W, 16);
    g.globalAlpha = 1;
    void now;
  }

  function drawSwarm(now, a) {
    if (!swarm.length) return;
    for (const d of swarm) {
      d.y += d.vy * lastDt; if (d.y < -30) { d.y = H + 30; d.x = rnd(0, W); }
      const x = d.x + Math.sin(now * d.sp + d.ph) * d.amp;
      const tw = 0.55 + 0.45 * Math.sin(now * d.sp * 2.1 + d.ph * 3);
      const col = d.rar === 0 ? "#ff9a3c" : RAR[d.rar].c;
      if (d.rar >= 3) px.glow(g, x, d.y, d.sz * 5, col, a * 0.5 * tw);
      g.globalAlpha = a * stepped(0.45 + 0.55 * tw, 3);
      px.ember(g, x, d.y, d.sz, col);
    }
    g.globalAlpha = 1;
  }

  /** A bat in design units, drawn into the low-res layer so it comes out as chunky pixels. */
  function drawBat(bg, b, now) {
    const f = Math.sin(now * 13 + b.ph) > 0 ? 1 : -0.3; // two-frame flap
    bg.save();
    bg.translate(b.x, b.y + Math.round(Math.sin(now * b.wob * 2 + b.ph) * 5) * 4);
    bg.scale(b.s * (b.vx < 0 ? -1 : 1), b.s);
    bg.fillStyle = "#0a0710";
    for (const sg of [-1, 1]) {
      bg.beginPath();
      bg.moveTo(sg * 6, -4);
      bg.lineTo(sg * 30, -28 * f - 6);
      bg.lineTo(sg * 56, -12 * f - 4);
      bg.lineTo(sg * 40, 12); bg.lineTo(sg * 28, 4); bg.lineTo(sg * 18, 14); bg.lineTo(sg * 6, 8);
      bg.closePath(); bg.fill();
    }
    bg.fillRect(-8, -10, 16, 24);
    bg.fillRect(-8, -18, 4, 8); bg.fillRect(4, -18, 4, 8);
    bg.fillStyle = "#ff6600"; bg.fillRect(-6, -6, 4, 4); bg.fillRect(2, -6, 4, 4);
    bg.restore();
  }

  function drawWall(now, a) {
    if (a <= 0.01) return;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i], p = t.p;
      if (!p) continue;
      let pop = easeOutBack((now - t.born) / 0.7);
      if (now < t.born) pop = 0;
      let sx = 1;
      if (t.swap) {
        const u = (now - t.swap.t0) / 0.7;
        if (u >= 0.5 && t.swap.next) { t.p = t.swap.next; t.swap.next = null; }
        sx = stepped(Math.abs(Math.cos(Math.PI * clamp(u))), 5);
        if (u >= 1) t.swap = null;
      }
      const rr = rarOf(t.p.tickets);
      const flick = Math.sin(now * (1.6 + rr * 0.5) + t.ph) * Math.sin(now * 3.1 + t.ph * 2) > 0 ? 1 : 0;
      const cy = t.y + (Math.sin(now * 0.9 + t.ph) > 0 ? -P : P);
      const sc = stepped(pop, 8) * (rr >= 3 ? 1 : 0.94);
      if (sc <= 0.01) continue;
      if (rr >= 2) px.glow(g, t.x, cy, t.w * (1.6 + rr * 0.15) * sc, RAR[rr].c, a * (0.35 + 0.15 * flick));
      drawCardAt(t.p, t.w, t.x, cy, { scale: sc, sx: Math.max(0.05, sx), alpha: stepped(a, 5) });
    }
    g.globalAlpha = 1;
  }

  /** A row of pixel chips («УЧАСНИКІВ 120»), centred at x. */
  function chips(items, x, y, a) {
    const size = 26, padX = 20, gap = 40, hgt = 44;
    const ws = items.map(([k, v]) => textW(k, size, 400) + 14 + textW(String(v), size));
    const total = ws.reduce((s, w) => s + w + 2 * padX, 0) + gap * (items.length - 1);
    let cx = x - total / 2;
    g.globalAlpha = a;
    items.forEach(([k, v], i) => {
      const bw = ws[i] + 2 * padX;
      px.box(g, cx, y - hgt / 2, bw, hgt, { frame: PAL.violet });
      text(k, cx + padX, y + 2, { size, weight: 400, color: PAL.bone, depth: 2 });
      text(String(v), cx + padX + textW(k, size, 400) + 14, y + 2, { size, color: PAL.amber, depth: 2 });
      cx += bw + gap;
    });
    g.globalAlpha = 1;
  }

  function drawHeader(now, a) {
    if (a <= 0.01) return;
    g.globalAlpha = a;
    const pl = pool(), tickets = pl.reduce((s, p) => s + p.tickets, 0);
    chips([["УЧАСНИКІВ", `${pl.length}  ·  КВИТКІВ ${tickets}`]], W / 2, 1030, a);
  }

  function drawMascot(now, a) {
    if (!px.ready(host)) return;
    g.globalAlpha = stepped(a, 5);
    const w = 300, h = w * host.naturalHeight / host.naturalWidth;
    const y = H - h - 70 + (Math.floor(now / 0.8) % 2 ? -8 : 0);
    g.drawImage(host, 0, px.snap(y), w, h);
    g.globalAlpha = 1;
  }

  // ---- strip
  const CARD_W = 248, STEP = 272, STRIP_Y = 548;
  function buildStrip(winner, info) {
    let pl = pool();
    if (!pl.some((p) => p.id === winner.id)) pl = [...pl, winner];
    if (pl.length < 2) pl = participants.length > 1 ? participants.slice() : pl;
    const cum = []; let tot = 0;
    for (const p of pl) { tot += Math.max(1, p.tickets); cum.push(tot); }
    const pickRaw = () => {
      const x = Math.random() * tot;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] > x) hi = m; else lo = m + 1; }
      return pl[lo];
    };
    const L = 80, Wi = 70, strip = new Array(L);
    strip[Wi] = winner;
    for (let i = 0; i < L; i++) {
      if (i === Wi) continue;
      const avoid = new Set([strip[i - 1]?.id, strip[i - 2]?.id]);
      if (Math.abs(i - Wi) <= 3) avoid.add(winner.id);
      if (pl.length > 6) { avoid.add(strip[i - 3]?.id); }
      let p = pickRaw(), tries = 0;
      while (avoid.has(p.id) && tries++ < 20) p = pickRaw();
      strip[i] = p;
    }
    const off = rnd(-0.26, 0.3) * STEP;
    const s0 = 4 * STEP;
    const s1 = (Wi - 1) * STEP + STEP * 0.5 - STEP * 0.08;   // pointer on the neighbour, a hair from the winner
    const s2 = Wi * STEP + off;
    return { winner, info, strip, Wi, s0, s1, s2, s: s0, v: 0, idx: -1, kick: 0, lastTick: 0, t0: 0, lockT: 0, revealed: false };
  }

  const T_INTRO = 1.2, T_A = 7.0, T_PAUSE = 0.95, T_CREEP = 2.7, T_HOLD = 0.65;
  const T_REVEAL = T_INTRO + T_A + T_PAUSE + T_CREEP + T_HOLD;

  function posAt(r, t) {
    const a0 = T_INTRO, a1 = a0 + T_A, a2 = a1 + T_PAUSE, a3 = a2 + T_CREEP;
    if (t < a0) return r.s0;
    if (t < a1) {
      const u = (t - a0) / T_A;
      const f = (1 - Math.pow(1 - u, 3.6)) * smooth(u / 0.09);
      return r.s0 + (r.s1 - r.s0) * Math.min(1, f);
    }
    if (t < a2) {
      const u = (t - a1) / T_PAUSE;
      return r.s1 + Math.sin(u * 22) * 3.5 * (1 - u) * (1 - u);          // tiny shiver of the strip
    }
    if (t < a3) {
      const u = (t - a2) / T_CREEP;
      return r.s1 + (r.s2 - r.s1) * (easeInOutCubic(u) * 0.55 + easeInOutQuad(Math.pow(u, 1.35)) * 0.45);
    }
    return r.s2;
  }

  function updateStrip(now, dt) {
    const r = rollState, t = now - r.t0;
    if (r.pending?.length) for (let k = 0; k < 6 && r.pending.length; k++) cardBitmap(r.pending.pop(), CARD_W, "name");
    const prev = r.s;
    r.s = posAt(r, t);
    r.v = lerp(r.v, dt > 0 ? (r.s - prev) / dt : 0, 0.35);
    const idx = Math.round(r.s / STEP);
    if (idx !== r.idx) {
      if (r.idx !== -1 && now - r.lastTick > 0.022) { snd("tick"); r.lastTick = now; }
      r.idx = idx; r.kick = 1;
    }
    r.kick = Math.max(0, r.kick - dt * 6);
    r.stripA = easeOutCubic(t / 0.9);
    if (!r.sounds) r.sounds = {};
    const mark = (k, cond, fn) => { if (cond && !r.sounds[k]) { r.sounds[k] = 1; fn(); } };
    mark("drum0", t > 0.05, () => snd("drum"));
    mark("whoosh", t > T_INTRO, () => snd("whoosh"));
    mark("drum1", t > T_INTRO + T_A + 0.02, () => snd("drum"));
    mark("drum2", t > T_INTRO + T_A + T_PAUSE + T_CREEP - 0.1, () => snd("drum"));
    if (t > T_REVEAL && !r.revealed) startReveal(now);
  }

  /** A pixel arrow pointing down (dir 1) or up (dir -1), built from stepped rows. */
  function arrow(x, y, dir, grow) {
    const rows = 7 + Math.round(grow * 2);
    for (let i = 0; i < rows; i++) {
      const half = (rows - i) * P, yy = y + dir * i * P;
      g.fillStyle = PAL.ink; g.fillRect(x - half - P, yy - P, 2 * half + 2 * P, 3 * P);
    }
    for (let i = 0; i < rows; i++) {
      const half = (rows - i) * P - P, yy = y + dir * i * P;
      if (half <= 0) continue;
      g.fillStyle = i < 2 ? PAL.gold : PAL.orange; g.fillRect(x - half, yy, 2 * half, P);
    }
  }

  function drawStrip(now) {
    const r = rollState, t = now - r.t0;
    const A = stepped(r.stripA ?? 0, 6);
    const fade = mode === "win" ? 1 - stepped((now - r.rt0) / 0.5, 5) : 1;
    const a = A * fade;
    if (a <= 0.003) return;
    const ch = CARD_W * 4 / 3, yOff = px.snap((1 - A) * 160);
    // header + footer
    g.globalAlpha = a;
    text("ВІДКРИВАЄМО КЕЙС", W / 2, 70, { size: 30, color: PAL.orange, align: "center", ls: 10 });
    if (r.info.prize?.name) {
      const pn = px.prizeLabel(r.info.prize.name);
      text(pn, W / 2, 158 - px.snap((1 - A) * 20), { size: px.fit(g, pn, 72, 1600), color: PAL.gold, align: "center", depth: 6, drop: PAL.rust });
    }
    // band: dark plum with a hard double rule top and bottom
    const by0 = px.snap(STRIP_Y - ch / 2 - 44 + yOff), bh = px.snap(ch + 96);
    g.fillStyle = PAL.ink; g.globalAlpha = a * 0.88; g.fillRect(0, by0, W, bh); g.globalAlpha = a;
    for (const yy of [by0 - 3 * P, by0 + bh]) {
      g.fillStyle = PAL.ink; g.fillRect(0, yy, W, 3 * P);
      g.fillStyle = PAL.orange; g.fillRect(0, yy + P, W, P);
    }
    g.fillStyle = PAL.amber; g.fillRect(0, by0 - 2 * P, W, P / 2);
    // cards
    const speed = Math.abs(r.v);
    const blur = speed > 1400 ? px.snap(clamp(speed * 0.011, 0, 72), 8) : 0;
    const lo = Math.max(0, Math.floor((r.s - 1250) / STEP)), hi = Math.min(r.strip.length - 1, Math.ceil((r.s + 1250) / STEP));
    const locked = t > T_INTRO + T_A + T_PAUSE + T_CREEP - 0.05;
    for (let i = lo; i <= hi; i++) {
      const p = r.strip[i], cx = W / 2 + i * STEP - r.s, cy = STRIP_Y + yOff;
      const d = Math.abs(cx - W / 2) / STEP;
      const hl = clamp(1 - d * 1.15);
      const sc = hl > 0.5 ? 1.06 : 1;
      const rr = rarOf(p.tickets);
      if (rr >= 2 && !blur) px.glow(g, cx, cy, CARD_W * 1.6, RAR[rr].c, a * (0.25 + 0.4 * hl));
      if (blur > 0) {
        drawCardAt(p, CARD_W, cx - blur, cy, { scale: sc, alpha: a * 0.25 });
        drawCardAt(p, CARD_W, cx + blur, cy, { scale: sc, alpha: a * 0.25 });
      }
      drawCardAt(p, CARD_W, cx, cy, { scale: sc, alpha: a * (d < 1.5 ? 1 : d < 3 ? 0.8 : 0.6) });
    }
    // edge fades: hard steps of ink
    const steps = [1, 0.8, 0.6, 0.4, 0.2];
    steps.forEach((k, i) => {
      g.fillStyle = PAL.ink; g.globalAlpha = a * k;
      g.fillRect(i * 64, by0, 64, bh); g.fillRect(W - (i + 1) * 64, by0, 64, bh);
    });
    g.globalAlpha = a;
    // pointer: a pixel bar with arrows
    const x = W / 2, y0 = by0 - 6 * P, y1 = by0 + bh + 6 * P, k = r.kick;
    if (locked && Math.floor(now * 8) % 2) px.glow(g, x, STRIP_Y + yOff, 560, RAR[rarOf(r.winner.tickets)].c, a * 0.6);
    const bw = k > 0.3 ? 3 * P : 2 * P;
    g.fillStyle = PAL.ink; g.fillRect(x - bw / 2 - P, y0, bw + 2 * P, y1 - y0);
    g.fillStyle = PAL.orange; g.fillRect(x - bw / 2, y0, bw, y1 - y0);
    g.fillStyle = PAL.gold; g.fillRect(x - bw / 2, y0, P, y1 - y0);
    arrow(x, y0 - 2 * P, 1, k);
    arrow(x, y1 + 2 * P, -1, k);
    g.globalAlpha = 1;
  }

  // ---- finale
  function burst(x, y, n, power = 1) {
    const cols = ["#ff6600", "#ff8a1f", "#ffb15c", "#ffd36b", "#7cff4f", "#8a3ffc", "#f4f1ea"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(180, 1500) * power * (Math.random() < 0.3 ? 1.5 : 1);
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, g: rnd(500, 1100), life: 0, max: rnd(0.9, 2.6),
        sz: Math.random() < 0.25 ? 3 * P : Math.random() < 0.5 ? 2 * P : P, col: cols[(Math.random() * cols.length) | 0], kind: Math.random() < 0.035 ? 1 : 0, drag: rnd(0.4, 1.1),
      });
    }
    if (particles.length > 1400) particles.splice(0, particles.length - 1400);
  }
  function startReveal(now) {
    const r = rollState; r.revealed = true; r.rt0 = now; mode = "win";
    const full = reduced() ? 0.5 : 1;
    r.fromX = W / 2 + r.Wi * STEP - r.s2; r.fromY = STRIP_Y;
    burst(W / 2, 430, Math.round(320 * full), 1);
    burst(W / 2, 430, Math.round(60 * full), 0.5);
    rings.push({ x: W / 2, y: 430, t: 0 }, { x: W / 2, y: 430, t: -0.12 });
    if (!reduced()) { flash = 1; shake = 1; }
    snd("boom"); setTimeout(() => snd("win"), 350);
    root.dataset.phase = "win";
  }

  const WIN_CARD_Y = 428, WIN_W = 364;
  function drawRays(now, color, ramp) {
    const bg = fx.begin();
    const rays = 16, rot = Math.round(now * (reduced() ? 0.08 : 0.16) * 24) / 24;
    bg.save(); bg.translate(W / 2, WIN_CARD_Y); bg.rotate(rot);
    bg.fillStyle = color; bg.globalAlpha = 0.16 * ramp;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2, a1 = a0 + Math.PI / rays * 0.8;
      bg.beginPath(); bg.moveTo(0, 0); bg.arc(0, 0, 1300, a0, a1); bg.closePath(); bg.fill();
    }
    bg.restore();
    fx.blit(g);
  }

  function drawWin(now, dt) {
    const r = rollState, u = now - r.rt0;
    const R0 = RAR[rarOf(r.winner.tickets)], R = rarOf(r.winner.tickets) === 0 ? { ...R0, c: PAL.orange } : R0;
    const ramp = stepped(u / 0.8, 6);
    // dim everything behind
    g.fillStyle = PAL.ink; g.globalAlpha = 0.72 * ramp; g.fillRect(-OX / S, -OY / S, CW / S, CH / S); g.globalAlpha = 1;
    drawRays(now, R.c, ramp);
    px.glow(g, W / 2, WIN_CARD_Y, 1100, R.c, 0.55 * ramp);
    px.glow(g, W / 2, WIN_CARD_Y, 640, PAL.orange, 0.5 * ramp);
    // the mascot presents the winner (not mirrored: the «21» on his sleeve must stay readable)
    if (px.ready(host) && u > 0.5) {
      const ap = stepped((u - 0.5) / 0.6, 5), w = 400, h = w * host.naturalHeight / host.naturalWidth;
      const bob = Math.floor(now * 3) % 2 ? -8 : 0;
      g.globalAlpha = ap;
      g.drawImage(host, px.snap(W / 2 - 700 - w / 2 - (1 - ap) * 120), px.snap(740 - h + bob), w, h);
      g.globalAlpha = 1;
    }
    // flying card
    const fly = easeOutBack(u / 0.85), fe = easeOutCubic(u / 0.85);
    const cx = lerp(r.fromX, W / 2, fe), cy = lerp(r.fromY, WIN_CARD_Y, fe);
    const sc = stepped(lerp(CARD_W / WIN_W, 1, fly), 12);
    const x = stepped((u - 0.5) / 0.35, 4);
    const bob = Math.floor(now * 2) % 2 ? -P : 0;
    drawCardAt(r.winner, WIN_W, cx, cy + bob * fe, { scale: sc, alpha: 1 - x, mode: "name" });
    if (x > 0) drawCardAt(r.winner, WIN_W, cx, cy + bob * fe, { scale: sc, alpha: x, mode: "hero" });
    // rings
    for (const rg of rings) {
      rg.t += dt; const q = rg.t / 1.1; if (q < 0 || q > 1) continue;
      g.globalAlpha = stepped(1 - q, 4);
      px.circle(g, rg.x, rg.y, 60 + easeOutCubic(q) * 900, q < 0.5 ? PAL.gold : PAL.amber, q < 0.4 ? 3 : 2, P * 2);
    }
    g.globalAlpha = 1;
    // texts
    const pop = (d) => stepped(easeOutBack((u - d) / 0.55), 8);
    const popA = (d) => stepped((u - d) / 0.3, 3);
    const scaled = (s, y, fn) => { if (s <= 0.01) return; g.save(); g.translate(W / 2, y); g.scale(s, s); fn(); g.restore(); };
    scaled(pop(0.45), 92, () => {
      g.globalAlpha = popA(0.45);
      text("ПЕРЕМОЖЕЦЬ", 0, 0, { size: 80, color: PAL.gold, align: "center", ls: 6, depth: 5, drop: PAL.rust });
    });
    const nm = r.winner.name;
    const fs = clamp(px.fit(g, nm, 168, 1560), 64, 168);
    scaled(pop(0.75), 806, () => {
      g.globalAlpha = popA(0.75);
      text(nm, 0, 0, { size: fs, color: PAL.bone, align: "center", depth: 8, drop: PAL.rust });
    });
    if (r.winner.handle) {
      scaled(pop(1.0), 912, () => {
        g.globalAlpha = popA(1.0);
        text(r.winner.handle, 0, 0, { size: clamp(px.fit(g, r.winner.handle, 76, 1200), 40, 76), color: PAL.slime, align: "center", depth: 5, drop: PAL.moss });
      });
    }
    const tt = r.winner.tickets;
    const info = `${R.n}  ·  ${tt} ${plural(tt)}`;
    scaled(pop(1.25), 1000, () => {
      g.globalAlpha = popA(1.25);
      const iw = px.snap(textW(info, 30) + 56);
      px.box(g, -iw / 2, -28, iw, 56, { frame: R.c });
      text(info, 0, 2, { size: 30, color: PAL.bone, align: "center", depth: 3 });
    });
    g.globalAlpha = 1;
    // ambient embers after burst
    if (u > 1.2 && Math.random() < 0.5) {
      particles.push({ x: rnd(0, W), y: H + 10, vx: rnd(-40, 40), vy: -rnd(120, 360), g: -30, life: 0, max: rnd(3, 6), sz: Math.random() < 0.3 ? 2 * P : P, col: Math.random() < 0.7 ? "#ff8a1f" : PAL.gold, kind: 0, drag: 0.2 });
    }
    if (u > 1.4 && u % 2.6 < dt && !reduced()) burst(rnd(300, W - 300), rnd(160, 480), 70, 0.45);
    if (u > 1.9 && !r.done) { r.done = true; r.resolve?.(); }
  }

  function drawParticles(dt) {
    if (!particles.length) return;
    let w = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life += dt; if (p.life >= p.max) continue;
      p.vx *= Math.pow(0.3, dt * p.drag); p.vy = p.vy * Math.pow(0.3, dt * p.drag) + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const q = p.life / p.max;
      g.globalAlpha = stepped((1 - q) * (1 - q), 4);
      if (p.kind === 1) {
        const s = p.sz > P ? 120 : 80;
        g.drawImage(pumpkin, px.snap(p.x - s / 2), px.snap(p.y - s / 2), s, s * 38 / 40);
      } else {
        px.ember(g, p.x, p.y, p.sz, p.col);
      }
      particles[w++] = p;
    }
    particles.length = w;
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- frame
  let lastDt = 1 / 60;
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - last); last = now; lastDt = dt;
    if (!CW || !CH) return;
    g.imageSmoothingEnabled = false;

    if (mode === "strip" || mode === "win") { if (rollState && !rollState.revealed) updateStrip(now, dt); else if (rollState) { rollState.stripA = 1; } }
    idleIn = mode === "idle" ? Math.min(1, idleIn + dt / 0.7) : idleIn;
    // wall-tile swapping so that everybody gets a moment on the wall
    if (mode === "idle" && now > nextSwapAt && tiles.length) {
      nextSwapAt = now + 1.6;
      const shown = new Set(tiles.map((t) => t.p.id));
      const rest = pool().filter((p) => !shown.has(p.id));
      if (rest.length) {
        const cand = tiles.filter((t) => !t.swap && now > t.born + 1);
        const t = cand[(Math.random() * cand.length) | 0];
        if (t) t.swap = { t0: now, next: sampleWeighted(rest, 1)[0] };
      }
    }

    const busy = mode !== "idle";
    drawBackground(now, busy);
    const wallA = mode === "idle" ? idleIn : mode === "strip" ? lerp(1, 0.18, smooth((rollState?.stripA ?? 0))) : 0.0;
    drawSwarm(now, busy ? 0.55 : 1);
    // bats
    const bg = back.begin();
    for (const b of bats) {
      b.x += b.vx * dt * (busy ? 1.6 : 1);
      if (b.vx > 0 && b.x > W + 120) { b.x = -120; b.y = rnd(160, 520); }
      if (b.vx < 0 && b.x < -120) { b.x = W + 120; b.y = rnd(160, 520); }
      drawBat(bg, b, now);
    }
    back.blit(g);
    if (mode === "idle" || (mode === "strip" && wallA > 0.02)) drawWall(now, wallA);
    if (mode === "idle") { drawHeader(now, stepped(idleIn, 5)); drawMascot(now, idleIn); }
    else if (mode === "strip" && wallA > 0.3) { drawHeader(now, stepped(wallA * (1 - rollState.stripA), 5)); }
    // shake (whole art pixels)
    g.save();
    if (shake > 0 && mode === "win") { shake = Math.max(0, shake - dt * 2.2); g.translate(px.snap(rnd(-1, 1) * 14 * shake), px.snap(rnd(-1, 1) * 14 * shake)); }
    if (rollState && (mode === "strip" || mode === "win")) drawStrip(now);
    if (mode === "win") drawWin(now, dt);
    drawParticles(dt);
    g.restore();
    if (flash > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = PAL.amber; g.globalAlpha = stepped(flash, 4) * 0.7; g.fillRect(0, 0, CW, CH); g.globalAlpha = 1;
      flash = Math.max(0, flash - dt * 2.8);
      g.setTransform(S, 0, 0, S, OX, OY);
    }
  }

  // ---------------------------------------------------------------- controller
  const onResize = () => fit();
  addEventListener("resize", onResize);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fit()) : null;
  ro?.observe(root);
  root.dataset.phase = "idle";
  fit();
  raf = requestAnimationFrame(frame);

  return {
    setParticipants(list) {
      participants = list.slice();
      localWon.clear();
      wallCap = 24;
      const now = performance.now() / 1000;
      if (mode === "idle") rebuildWall(now);
      else { tiles = []; rebuildSwarm(); }
      // drop cached bitmaps of people who are gone
      if (cardCache.size > 300) cardCache.clear();
      root.dataset.pool = String(pool().length);
    },
    roll(winner, info) {
      return new Promise((resolve) => {
        const now = performance.now() / 1000;
        localWon.delete(winner.id);
        particles = []; rings = []; flash = 0; shake = 0;
        const r = buildStrip(winner, info);
        r.t0 = now; r.resolve = () => { localWon.add(winner.id); root.dataset.phase = "done"; resolve(); };
        // pre-render card bitmaps so that the spin never hitches
        for (const p of r.strip.slice(0, 12)) cardBitmap(p, CARD_W, "name");
        r.pending = r.strip.slice(12);
        cardBitmap(winner, WIN_W, "hero"); cardBitmap(winner, WIN_W, "name");
        rollState = r; mode = "strip"; idleIn = 0;
        root.dataset.phase = "roll"; root.dataset.shownWinner = winner.id;
        last = performance.now() / 1000;
      });
    },
    reset() {
      if (rollState && !rollState.done) { try { rollState.resolve?.(); } catch { /* ignore */ } }
      mode = "idle"; idleIn = 0; rollState = null; particles = []; rings = []; flash = 0; shake = 0;
      delete root.dataset.shownWinner;
      root.dataset.phase = "idle";
      rebuildWall(performance.now() / 1000);
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      removeEventListener("resize", onResize); ro?.disconnect(); canvas.remove();
    },
  };
}
