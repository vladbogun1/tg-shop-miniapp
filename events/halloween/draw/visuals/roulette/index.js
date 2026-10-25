// Visual "roulette": CS-style case opening, Halloween edition.
// Idle: a wall of pumpkin-cases (rarity by tickets) + a swarm of embers for everybody else, fog, bats.
// Roll: a horizontal strip of participant cards that accelerates, ticks, brakes, fake-stops on the
// neighbour and creeps onto the winner chosen by the server. Finale: card flies forward, pumpkin burst.
export const meta = { id: "roulette", title: "Кейс-рулетка", author: "agent" };

const W = 1920, H = 1080;
const FONT = '"Exo 2", system-ui, sans-serif';
const SPRITE = (n) => new URL(`../../assets/sprites/${n}.png`, import.meta.url).href;

const RAR = [
  { n: "ЗВИЧАЙНА", c: "#9aa8c0" },
  { n: "РІДКІСНА", c: "#4b8bff" },
  { n: "ЕПІЧНА", c: "#a165ff" },
  { n: "МІФІЧНА", c: "#ff3fd0" },
  { n: "ЛЕГЕНДАРНА", c: "#ffc83a" },
];
const rarOf = (t) => Math.max(0, Math.min(4, (t | 0) - 1));
const plural = (n) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return "квиток";
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "квитки";
  return "квитків";
};

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeInOutQuad = (t) => { t = clamp(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const easeOutBack = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rnd = (a, b) => a + Math.random() * (b - a);

function cv(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------------------------------------------------------------- sprites (pre-rendered once)
function makePumpkin() {
  const c = cv(256, 240), g = c.getContext("2d");
  const lobe = (cx, rx, ry, c0, c1) => {
    const gr = g.createRadialGradient(cx - rx * 0.3, 136 - ry * 0.45, rx * 0.1, cx, 140, Math.max(rx, ry));
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, 138, rx, ry, 0, 0, 7); g.fill();
    g.strokeStyle = "rgba(110,30,0,.5)"; g.lineWidth = 2.5; g.stroke();
  };
  lobe(64, 56, 78, "#ff7a14", "#a83200");
  lobe(192, 56, 78, "#ff7a14", "#a83200");
  lobe(98, 56, 88, "#ff8f2a", "#c23e00");
  lobe(158, 56, 88, "#ff8f2a", "#c23e00");
  lobe(128, 52, 94, "#ffa83f", "#d94a00");
  const st = g.createLinearGradient(0, 8, 0, 56);
  st.addColorStop(0, "#7fe04a"); st.addColorStop(1, "#2f7a1c");
  g.fillStyle = st; g.strokeStyle = "#1b4a0e"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(114, 52); g.quadraticCurveTo(116, 20, 140, 8); g.lineTo(152, 18);
  g.quadraticCurveTo(138, 28, 138, 54); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "rgba(255,255,255,.16)"; g.beginPath(); g.ellipse(100, 106, 18, 34, -0.5, 0, 7); g.fill();
  return c;
}
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = cv(128, 128); const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, hexRgba(color, 1)); gr.addColorStop(0.35, hexRgba(color, 0.45)); gr.addColorStop(1, hexRgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}
function fogSprite(color) {
  const c = cv(256, 256), g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, hexRgba(color, 0.9)); gr.addColorStop(0.5, hexRgba(color, 0.35)); gr.addColorStop(1, hexRgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return c;
}

// ---------------------------------------------------------------- mount
export function mount(root, ctx) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  root.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });
  const reduced = () => !!ctx.reducedMotion;
  const avatarsOn = () => ctx.privacy?.avatars !== false;
  const snd = (n) => { try { ctx.sound?.(n); } catch { /* sound must never break the show */ } };

  const pumpkin = makePumpkin();
  const fogA = fogSprite("#7a4bd0"), fogB = fogSprite("#a4521f");
  const heroWave = new Image(); heroWave.src = SPRITE("hero_wave");
  const heroCheer = new Image(); heroCheer.src = SPRITE("donate_hero");
  try { document.fonts?.load(`800 40px "Exo 2"`, "Ґєїі Абв"); document.fonts?.load(`600 40px "Exo 2"`, "Ґєїі Абв"); } catch { /* ignore */ }

  // canvas geometry
  let S = 1, OX = 0, OY = 0, CW = 1920, CH = 1080, DPR = 1;
  function fit() {
    const w = root.clientWidth || ctx.size?.w || innerWidth, h = root.clientHeight || ctx.size?.h || innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CW = Math.round(w * DPR); CH = Math.round(h * DPR);
    canvas.width = CW; canvas.height = CH;
    S = Math.min(CW / W, CH / H); OX = (CW - W * S) / 2; OY = (CH - H * S) / 2;
    cardCache.clear(); bgC = null;
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
  function fitFont(gg, text, weight, size, maxW) {
    gg.font = `${weight} ${size}px ${FONT}`;
    const m = gg.measureText(text).width;
    return m > maxW ? size * maxW / m : size;
  }
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
  function renderCard(p, w, mode, av) {
    const h = w * 4 / 3, px = S * (mode === "hero" ? 1 : 1);
    const c = cv(w * px, h * px), gg = c.getContext("2d");
    gg.scale(c.width / w, c.height / h);
    const rr = rarOf(p.tickets), R = RAR[rr];
    // body
    rrect(gg, 0, 0, w, h, w * 0.075);
    const body = gg.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, "#221e2c"); body.addColorStop(0.55, "#141219"); body.addColorStop(1, hexRgba(R.c, 0.42));
    gg.fillStyle = body; gg.fill();
    gg.save(); gg.clip();
    // art glow
    const ax = w / 2, ay = h * 0.36;
    const ag = gg.createRadialGradient(ax, ay, 0, ax, ay, w * 0.62);
    ag.addColorStop(0, hexRgba(R.c, 0.45)); ag.addColorStop(1, hexRgba(R.c, 0));
    gg.fillStyle = ag; gg.fillRect(0, 0, w, h);
    if (av) {
      const r = w * 0.29;
      gg.save(); gg.beginPath(); gg.arc(ax, ay + w * 0.02, r, 0, 7); gg.clip();
      const iw = av.naturalWidth || 96, ih = av.naturalHeight || 96, k = Math.max(2 * r / iw, 2 * r / ih);
      gg.drawImage(av, ax - iw * k / 2, ay + w * 0.02 - ih * k / 2, iw * k, ih * k);
      gg.restore();
      const rg = gg.createLinearGradient(ax - r, ay - r, ax + r, ay + r);
      rg.addColorStop(0, "#ffd37a"); rg.addColorStop(1, "#ff6600");
      gg.strokeStyle = rg; gg.lineWidth = w * 0.03;
      gg.beginPath(); gg.arc(ax, ay + w * 0.02, r, 0, 7); gg.stroke();
      // little stem + leaf on top of the ring
      gg.fillStyle = "#5fd13a"; gg.strokeStyle = "#1b4a0e"; gg.lineWidth = w * 0.006;
      gg.beginPath(); gg.moveTo(ax - w * 0.03, ay - r + w * 0.02); gg.quadraticCurveTo(ax - w * 0.02, ay - r - w * 0.07, ax + w * 0.05, ay - r - w * 0.09);
      gg.lineTo(ax + w * 0.07, ay - r - w * 0.05); gg.quadraticCurveTo(ax + w * 0.03, ay - r - w * 0.03, ax + w * 0.03, ay - r + w * 0.02); gg.closePath(); gg.fill(); gg.stroke();
    } else {
      const pw = w * 0.8, ph = pw * 240 / 256;
      gg.drawImage(pumpkin, ax - pw / 2, ay - ph / 2 + w * 0.03, pw, ph);
      const ch = (p.name || "?").trim().charAt(0).toUpperCase() || "?";
      gg.font = `800 ${w * 0.27}px ${FONT}`; gg.textAlign = "center"; gg.textBaseline = "middle";
      gg.shadowColor = "rgba(255,230,120,.9)"; gg.shadowBlur = w * 0.05;
      gg.fillStyle = "#3a1100"; gg.fillText(ch, ax, ay + w * 0.09);
      gg.shadowBlur = 0;
    }
    // texts
    gg.textAlign = "center"; gg.textBaseline = "middle";
    const maxW = w * 0.88;
    if (mode === "hero") {
      gg.fillStyle = "#fff";
      const fs = fitFont(gg, R.n, 800, w * 0.1, maxW);
      gg.font = `800 ${fs}px ${FONT}`; gg.fillStyle = R.c;
      if ("letterSpacing" in gg) gg.letterSpacing = `${w * 0.012}px`;
      gg.fillText(R.n, ax, h * 0.76);
      if ("letterSpacing" in gg) gg.letterSpacing = "0px";
    } else {
      const fs = fitFont(gg, p.name, 800, w * 0.125, maxW);
      gg.font = `800 ${fs}px ${FONT}`; gg.fillStyle = "#fff";
      gg.fillText(p.name, ax, h * (p.handle ? 0.695 : 0.72));
      if (p.handle) {
        const fh = fitFont(gg, p.handle, 600, w * 0.075, maxW);
        gg.font = `600 ${fh}px ${FONT}`; gg.fillStyle = "#b9b2a6";
        gg.fillText(p.handle, ax, h * 0.775);
      }
    }
    // bottom stripe
    const sy = h * 0.865;
    const sg = gg.createLinearGradient(0, sy, w, sy);
    sg.addColorStop(0, hexRgba(R.c, 0.95)); sg.addColorStop(1, hexRgba(R.c, 0.7));
    gg.fillStyle = sg; gg.fillRect(0, sy, w, h - sy);
    gg.fillStyle = "#0c0a10"; gg.font = `800 ${w * 0.072}px ${FONT}`;
    if ("letterSpacing" in gg) gg.letterSpacing = `${w * 0.004}px`;
    gg.fillText(mode === "hero" ? `${p.tickets} ${plural(p.tickets)}` : `${p.tickets} ${plural(p.tickets)}`, ax, sy + (h - sy) / 2 + 1);
    if ("letterSpacing" in gg) gg.letterSpacing = "0px";
    // sheen
    const sh = gg.createLinearGradient(0, 0, w, h * 0.6);
    sh.addColorStop(0, "rgba(255,255,255,.12)"); sh.addColorStop(0.5, "rgba(255,255,255,0)");
    gg.fillStyle = sh; gg.fillRect(0, 0, w, h);
    gg.restore();
    // border
    rrect(gg, w * 0.007, w * 0.007, w * 0.986, h - w * 0.014, w * 0.07);
    gg.strokeStyle = hexRgba(R.c, 0.95); gg.lineWidth = w * 0.014; gg.stroke();
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
  const bats = Array.from({ length: 5 }, (_, i) => ({ x: rnd(-200, W + 200), y: rnd(120, 560), s: rnd(0.55, 1.1), vx: (Math.random() < 0.5 ? -1 : 1) * rnd(70, 150), ph: rnd(0, 7), wob: rnd(0.4, 1), i }));
  const puffs = Array.from({ length: 8 }, (_, i) => ({
    x: i < 3 ? rnd(-100, 300) : i < 6 ? rnd(W - 300, W + 100) : rnd(0, W),
    y: i < 6 ? rnd(300, 1100) : rnd(960, 1140), r: rnd(380, 640), sp: rnd(8, 22) * (i % 2 ? 1 : -1), ph: rnd(0, 7), a: rnd(0.07, 0.13), B: i % 3 === 0,
  }));

  const pool = () => participants.filter((p) => !p.won && !localWon.has(p.id));

  function sampleWeighted(list, k) {
    const keyed = list.map((p) => ({ p, k: Math.pow(Math.random(), 1 / Math.max(1, p.tickets)) }));
    keyed.sort((a, b) => b.k - a.k);
    return keyed.slice(0, k).map((x) => x.p);
  }

  function layoutWall() {
    const T = tiles.length;
    if (!T) return;
    const RX = 90, RY = 222, RW = W - 180, RH = 700, gap = 22, cap = 270;
    let best = { w: 0, c: 1 };
    for (let c = 1; c <= T; c++) {
      const rows = Math.ceil(T / c);
      const w = Math.min((RW - (c - 1) * gap) / c, (RH - (rows - 1) * gap) / (rows * 4 / 3), cap);
      if (w > best.w + 0.5) best = { w, c };
    }
    const { w, c } = best, h = w * 4 / 3, rows = Math.ceil(T / c);
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
      sz: 8 + rarOf(p.tickets) * 5 + Math.min(p.tickets, 8) * 0.6, rar: rarOf(p.tickets),
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
  function text(str, x, y, size, weight, color, align = "left", ls = 0) {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align; g.textBaseline = "middle"; g.fillStyle = color;
    if ("letterSpacing" in g) g.letterSpacing = `${ls}px`;
    g.fillText(str, x, y);
    if ("letterSpacing" in g) g.letterSpacing = "0px";
  }
  function textW(str, size, weight, ls = 0) {
    g.font = `${weight} ${size}px ${FONT}`;
    if ("letterSpacing" in g) g.letterSpacing = `${ls}px`;
    const w = g.measureText(str).width;
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    return w;
  }
  function glowAt(x, y, size, color, a) {
    if (a <= 0.003) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(glowSprite(color), x - size / 2, y - size / 2, size, size);
  }
  function drawCardAt(p, w, cx, cy, o = {}) {
    const bm = cardBitmap(p, w, o.mode || "name");
    const sc = o.scale ?? 1, sx = o.sx ?? 1, h = w * 4 / 3;
    g.save();
    g.globalAlpha = o.alpha ?? 1;
    g.translate(cx, cy); g.rotate(o.rot || 0); g.scale(sc * sx, sc);
    g.drawImage(bm, -w / 2, -h / 2, w, h);
    g.restore();
  }

  // ---------------------------------------------------------------- scenes
  let bgC = null, vigC = null;
  function bakeStatic() {
    bgC = cv(CW, CH); vigC = cv(CW, CH);
    const b = bgC.getContext("2d");
    b.fillStyle = "#0e0e10"; b.fillRect(0, 0, CW, CH);
    b.setTransform(S, 0, 0, S, OX, OY);
    let gr = b.createRadialGradient(W / 2, H + 120, 50, W / 2, H + 120, 1100);
    gr.addColorStop(0, "rgba(255,102,0,.20)"); gr.addColorStop(1, "rgba(255,102,0,0)");
    b.fillStyle = gr; b.fillRect(-OX / S, 0, CW / S, H);
    gr = b.createRadialGradient(W * 0.2, -100, 20, W * 0.2, -100, 900);
    gr.addColorStop(0, "rgba(138,63,252,.18)"); gr.addColorStop(1, "rgba(138,63,252,0)");
    b.fillStyle = gr; b.fillRect(-OX / S, 0, CW / S, H);
    b.globalAlpha = 0.2; b.fillStyle = "#ffcf94"; b.beginPath(); b.arc(1500, 300, 92, 0, 7); b.fill();
    b.globalAlpha = 1; b.fillStyle = "rgba(14,14,16,.42)"; b.beginPath(); b.arc(1530, 280, 84, 0, 7); b.fill();
    const v = vigC.getContext("2d");
    const vg = v.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.45, CW / 2, CH / 2, Math.hypot(CW, CH) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.6)");
    v.fillStyle = vg; v.fillRect(0, 0, CW, CH);
  }
  function drawBackground(now) {
    if (!bgC || bgC.width !== CW || bgC.height !== CH) bakeStatic();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.drawImage(bgC, 0, 0);
    g.setTransform(S, 0, 0, S, OX, OY);
    g.globalCompositeOperation = "lighter";
    glowAt(1500, 300, 620, "#ff9a3c", 0.1 + 0.02 * Math.sin(now * 0.6));
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  function drawSwarm(now, a) {
    if (!swarm.length) return;
    g.globalCompositeOperation = "lighter";
    for (const d of swarm) {
      d.y += d.vy * lastDt; if (d.y < -30) { d.y = H + 30; d.x = rnd(0, W); }
      const x = d.x + Math.sin(now * d.sp + d.ph) * d.amp;
      const tw = 0.55 + 0.45 * Math.sin(now * d.sp * 2.1 + d.ph * 3);
      const col = RAR[d.rar].c;
      const al = a * (0.2 + 0.22 * tw) * (d.rar >= 3 ? 1.25 : 1);
      glowAt(x, d.y, d.sz * 3.2, d.rar === 0 ? "#ff8a2a" : col, al);
      g.globalAlpha = Math.min(1, a * (0.5 + 0.5 * tw));
      g.fillStyle = d.rar === 0 ? "#ffd9a0" : "#fff";
      g.fillRect(x - 1.5, d.y - 1.5, 3, 3);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  function drawFog(now, a) {
    g.globalCompositeOperation = "source-over";
    for (const p of puffs) {
      const x = p.x + Math.sin(now * 0.07 + p.ph) * 120 + now * p.sp * 0.0;
      const y = p.y + Math.cos(now * 0.09 + p.ph) * 30;
      g.globalAlpha = p.a * a * (0.8 + 0.2 * Math.sin(now * 0.3 + p.ph));
      g.drawImage(p.B ? fogB : fogA, x - p.r, y - p.r * 0.45, p.r * 2, p.r * 0.9);
    }
    g.globalAlpha = 1;
  }

  function drawBat(b, now) {
    const f = Math.sin(now * 13 + b.ph) * 0.9 + 0.1;
    g.save();
    g.translate(b.x, b.y + Math.sin(now * b.wob * 2 + b.ph) * 22);
    g.scale(b.s * (b.vx < 0 ? -1 : 1), b.s);
    g.fillStyle = "#0a0710"; g.strokeStyle = "rgba(160,100,255,.55)"; g.lineWidth = 1.6;
    for (const sg of [-1, 1]) {
      g.beginPath();
      g.moveTo(sg * 5, -3);
      g.quadraticCurveTo(sg * 26, -26 * f - 4, sg * 52, -12 * f - 2);
      g.quadraticCurveTo(sg * 44, 0, sg * 38, 12);
      g.quadraticCurveTo(sg * 30, 2, sg * 24, 12);
      g.quadraticCurveTo(sg * 16, 3, sg * 10, 10);
      g.quadraticCurveTo(sg * 6, 6, sg * 5, 8);
      g.closePath(); g.fill(); g.stroke();
    }
    g.beginPath(); g.ellipse(0, 2, 7, 11, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-6, -8); g.lineTo(-4, -17); g.lineTo(0, -10); g.lineTo(4, -17); g.lineTo(6, -8); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#ff3a1e"; g.fillRect(-4, -5, 2.4, 2.4); g.fillRect(1.8, -5, 2.4, 2.4);
    g.restore();
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
        sx = Math.abs(Math.cos(Math.PI * clamp(u)));
        if (u >= 1) t.swap = null;
      }
      const rr = rarOf(t.p.tickets);
      const flick = 0.5 + 0.5 * Math.sin(now * (1.6 + rr * 0.5) + t.ph) * Math.sin(now * 3.1 + t.ph * 2);
      const m = (0.9 + 0.025 * rr) * (1 + 0.012 * Math.sin(now * 1.3 + t.ph));
      const cy = t.y + Math.sin(now * 0.9 + t.ph) * 5;
      const sc = m * pop;
      if (sc <= 0.01) continue;
      // glow stronger with rarity
      g.globalCompositeOperation = "lighter";
      glowAt(t.x, cy, t.w * (1.9 + rr * 0.22) * sc, RAR[rr].c, a * (0.16 + 0.17 * rr + 0.12 * flick * (1 + rr * 0.3)));
      g.globalCompositeOperation = "source-over";
      drawCardAt(t.p, t.w, t.x, cy, { scale: sc, sx: Math.max(0.02, sx), alpha: a });
    }
    g.globalAlpha = 1;
  }

  function drawHeader(now, a) {
    g.globalAlpha = a;
    const won = new Set(participants.filter((p) => p.won).map((p) => p.id));
    localWon.forEach((id) => won.add(id));
    const k = Math.min(5, won.size + 1);
    text("CHISETUP  ·  HALLOWEEN", 90, 70, 24, 700, "#ff6600", "left", 7);
    text(won.size >= 5 ? "Розіграш завершено" : `Розіграш · Раунд ${k} з 5`, 90, 128, 64, 800, "#f4f1ea");
    const pl = pool(), tickets = pl.reduce((s, p) => s + p.tickets, 0);
    if (pl.length > tiles.length) text(`На стіні випадкові ${tiles.length} з ${pl.length}, решта миготить у темряві`, 90, 180, 24, 500, "#9a958c");
    const line = `УЧАСНИКІВ  ${pl.length}   ·   КВИТКІВ  ${tickets}${won.size ? `   ·   ВЖЕ ВИГРАЛИ  ${won.size}` : ""}`;
    text(line, W / 2, 1036, 26, 600, "#cfc9bd", "center", 3);
    // rarity legend, bottom right
    let x = W - 90;
    const lab = ["1", "2", "3", "4", "5+"];
    text("КВИТКІВ", x, 1036, 18, 600, "#8d887e", "right", 3);
    x -= textW("КВИТКІВ", 18, 600, 3) + 22;
    for (let i = 4; i >= 0; i--) {
      text(lab[i], x, 1036, 22, 800, RAR[i].c, "right");
      x -= textW(lab[i], 22, 800) + 10;
      g.fillStyle = RAR[i].c; rrect(g, x - 16, 1026, 16, 20, 4); g.fill();
      x -= 34;
    }
    g.globalAlpha = 1;
  }

  function drawMascot(now, a) {
    if (!heroWave.complete || !heroWave.naturalWidth) return;
    g.globalAlpha = a; g.imageSmoothingEnabled = false;
    const sc = 3, w = heroWave.naturalWidth * sc, h = heroWave.naturalHeight * sc;
    const y = H - h + 6 + Math.sin(now * 2) * 3;
    g.drawImage(heroWave, 20, y, w, h);
    g.imageSmoothingEnabled = true; g.globalAlpha = 1;
  }

  // ---- strip
  const CARD_W = 250, STEP = 268, STRIP_Y = 548;
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
    if (t < a0) return r.s0 + Math.sin(t * 3) * 0.0;
    if (t < a1) {
      const u = (t - a0) / T_A;
      const f = (1 - Math.pow(1 - u, 3.6)) * smooth(u / 0.09 + 0.0) + 0;
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

  function drawStrip(now) {
    const r = rollState, t = now - r.t0;
    const A = r.stripA ?? 0;
    const fade = mode === "win" ? 1 - smooth((now - r.rt0) / 0.5) : 1;
    const a = A * fade;
    if (a <= 0.003) return;
    const ch = CARD_W * 4 / 3, yOff = (1 - A) * 160;
    // header + footer
    g.globalAlpha = a;
    text(`Раунд ${r.info.round} з ${r.info.totalRounds}`, W / 2, 112 - (1 - A) * 20, 84, 800, "#f4f1ea", "center", 1);
    text("ВІДКРИВАЄМО КЕЙС", W / 2, 182, 24, 700, "#ff6600", "center", 12);
    const sh = r.info.seedHash && r.info.seedHash.length > 8 ? `   ·   seed sha256: ${r.info.seedHash.slice(0, 16)}…` : "";
    text(`КВИТКІВ У РОЗІГРАШІ  ${r.info.totalTickets ?? ""}${sh}`, W / 2, 1036, 22, 600, "#8d887e", "center", 3);
    // band
    const by0 = STRIP_Y - ch / 2 - 46 + yOff, bh = ch + 92;
    g.fillStyle = "rgba(7,6,11,.82)"; g.fillRect(0, by0, W, bh);
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, "rgba(255,102,0,0)"); lg.addColorStop(0.5, "rgba(255,150,40,.9)"); lg.addColorStop(1, "rgba(255,102,0,0)");
    g.fillStyle = lg; g.fillRect(0, by0, W, 3); g.fillRect(0, by0 + bh - 3, W, 3);
    // cards
    const speed = Math.abs(r.v);
    const blur = speed > 1400 ? clamp(speed * 0.011, 0, 70) : 0;
    const lo = Math.max(0, Math.floor((r.s - 1250) / STEP)), hi = Math.min(r.strip.length - 1, Math.ceil((r.s + 1250) / STEP));
    const locked = t > T_INTRO + T_A + T_PAUSE + T_CREEP - 0.05;
    for (let i = lo; i <= hi; i++) {
      const p = r.strip[i], cx = W / 2 + i * STEP - r.s, cy = STRIP_Y + yOff;
      const d = Math.abs(cx - W / 2) / STEP;
      const hl = clamp(1 - d * 1.15) ;
      const sc = 1 + 0.07 * hl * hl;
      const rr = rarOf(p.tickets);
      if (rr >= 2 || hl > 0.4) {
        g.globalCompositeOperation = "lighter";
        glowAt(cx, cy, CARD_W * 1.7, RAR[rr].c, a * (rr >= 2 ? 0.28 + rr * 0.05 : 0.12) * (0.4 + 0.6 * hl));
        g.globalCompositeOperation = "source-over";
      }
      if (blur > 0) {
        drawCardAt(p, CARD_W, cx - blur, cy, { scale: sc, alpha: a * 0.22 });
        drawCardAt(p, CARD_W, cx + blur, cy, { scale: sc, alpha: a * 0.22 });
      }
      drawCardAt(p, CARD_W, cx, cy, { scale: sc, alpha: a * (0.55 + 0.45 * smooth(1 - d / 5)) });
      if (hl > 0.5 && !blur) {
        g.globalAlpha = a * (hl - 0.5) * 0.9;
        g.strokeStyle = "#fff"; g.lineWidth = 3;
        rrect(g, cx - CARD_W * sc / 2, cy - ch * sc / 2, CARD_W * sc, ch * sc, CARD_W * 0.075 * sc); g.stroke();
      }
    }
    // edge fades
    g.globalAlpha = a;
    const eg = g.createLinearGradient(0, 0, W, 0);
    eg.addColorStop(0, "rgba(14,14,16,1)"); eg.addColorStop(0.2, "rgba(14,14,16,0)"); eg.addColorStop(0.8, "rgba(14,14,16,0)"); eg.addColorStop(1, "rgba(14,14,16,1)");
    g.fillStyle = eg; g.fillRect(0, by0, W, bh);
    // pointer
    const px = W / 2, y0 = by0 - 26, y1 = by0 + bh + 26, k = r.kick;
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(255,120,20,.28)"; g.fillRect(px - 16 - k * 6, y0, 32 + k * 12, y1 - y0);
    if (locked) glowAt(px, STRIP_Y + yOff, 520, RAR[rarOf(r.winner.tickets)].c, a * (0.3 + 0.2 * Math.sin(now * 14)));
    g.globalCompositeOperation = "source-over";
    const pg = g.createLinearGradient(0, y0, 0, y1);
    pg.addColorStop(0, "#ffd37a"); pg.addColorStop(0.5, "#ff7a14"); pg.addColorStop(1, "#ffd37a");
    g.fillStyle = pg; g.fillRect(px - 2.5 - k * 1.5, y0, 5 + k * 3, y1 - y0);
    for (const [yy, dir] of [[y0, 1], [y1, -1]]) {
      g.beginPath(); g.moveTo(px - 26, yy - dir * 10); g.lineTo(px + 26, yy - dir * 10); g.lineTo(px, yy + dir * (26 + k * 6)); g.closePath();
      g.fillStyle = "#ff7a14"; g.fill(); g.strokeStyle = "#ffe0a0"; g.lineWidth = 3; g.stroke();
    }
    g.globalAlpha = 1;
  }

  // ---- finale
  function burst(x, y, n, power = 1) {
    const cols = ["#ff6600", "#ff8a1f", "#ffc83a", "#ffe29a", "#7cff4f", "#8a3ffc", "#ff3a1e"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(180, 1500) * power * (Math.random() < 0.3 ? 1.5 : 1);
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, g: rnd(500, 1100), life: 0, max: rnd(0.9, 2.6),
        sz: rnd(4, 13), col: cols[(Math.random() * cols.length) | 0], kind: Math.random() < 0.08 ? 1 : 0, rot: rnd(0, 7), vr: rnd(-8, 8), drag: rnd(0.4, 1.1),
      });
    }
    if (particles.length > 1400) particles.splice(0, particles.length - 1400);
  }
  function startReveal(now) {
    const r = rollState; r.revealed = true; r.rt0 = now; mode = "win";
    const full = reduced() ? 0.5 : 1;
    const cx = W / 2 - (r.s2 - r.Wi * STEP) * -1;
    r.fromX = W / 2 + r.Wi * STEP - r.s2; r.fromY = STRIP_Y;
    burst(W / 2, 430, Math.round(320 * full), 1);
    burst(W / 2, 430, Math.round(60 * full), 0.5);
    rings.push({ x: W / 2, y: 430, t: 0 }, { x: W / 2, y: 430, t: -0.12 });
    if (!reduced()) { flash = 1; shake = 1; }
    snd("boom"); setTimeout(() => snd("win"), 350);
    root.dataset.phase = "win";
    void cx;
  }

  const WIN_CARD_Y = 428, WIN_SCALE = 1.45;
  function drawWin(now, dt) {
    const r = rollState, u = now - r.rt0;
    const R0 = RAR[rarOf(r.winner.tickets)], R = rarOf(r.winner.tickets) === 0 ? { ...R0, c: "#ff8a1f" } : R0;
    const ramp = smooth(u / 0.8);
    // dim everything behind
    g.fillStyle = `rgba(8,6,12,${0.72 * ramp})`; g.fillRect(-OX / S, -OY / S, CW / S, CH / S);
    // glow + rays
    g.globalCompositeOperation = "lighter";
    glowAt(W / 2, WIN_CARD_Y, 1500, R.c, 0.5 * ramp);
    glowAt(W / 2, WIN_CARD_Y, 900, "#ff6600", 0.35 * ramp);
    const rays = 16, rot = now * (reduced() ? 0.08 : 0.16);
    g.save(); g.translate(W / 2, WIN_CARD_Y); g.rotate(rot);
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2, a1 = a0 + Math.PI / rays * 0.8;
      const rg = g.createRadialGradient(0, 0, 100, 0, 0, 1300);
      rg.addColorStop(0, hexRgba(R.c, 0.2 * ramp)); rg.addColorStop(1, hexRgba(R.c, 0));
      g.fillStyle = rg; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 1300, a0, a1); g.closePath(); g.fill();
    }
    g.restore();
    g.globalCompositeOperation = "source-over";
    // heroes cheering
    if (heroCheer.complete && heroCheer.naturalWidth && u > 0.5) {
      const ap = easeOutCubic((u - 0.5) / 0.6), fr = Math.floor(now * 6) % 4, fw = 48, sc = 6;
      g.imageSmoothingEnabled = false;
      for (const side of [-1, 1]) {
        g.save(); g.globalAlpha = ap; g.translate(W / 2 + side * 560 + side * (1 - ap) * 120, 640 - Math.abs(Math.sin(now * 3 + (side > 0 ? 1.5 : 0))) * 18);
        g.scale(-side * sc, sc);
        g.drawImage(heroCheer, fr * fw, 0, fw, 75, -fw / 2, -75, fw, 75);
        g.restore();
      }
      g.imageSmoothingEnabled = true; g.globalAlpha = 1;
    }
    // flying card
    const fly = easeOutBack(u / 0.85), fe = easeOutCubic(u / 0.85);
    const cx = lerp(r.fromX, W / 2, fe), cy = lerp(r.fromY, WIN_CARD_Y, fe);
    const sc = lerp(1, WIN_SCALE, fly);
    const wob = Math.sin(now * 1.4) * 0.012;
    const hero = 250 * WIN_SCALE;
    g.globalCompositeOperation = "lighter"; glowAt(cx, cy, 700 * sc, R.c, 0.55 * fe); g.globalCompositeOperation = "source-over";
    const bmN = cardBitmap(r.winner, 363, "name"), bmH = cardBitmap(r.winner, 363, "hero"), x = smooth((u - 0.5) / 0.35);
    void hero;
    g.save(); g.translate(cx, cy + Math.sin(now * 1.8) * 6 * fe); g.rotate(wob * fe); g.scale(sc / WIN_SCALE, sc / WIN_SCALE);
    g.globalAlpha = 1 - x; g.drawImage(bmN, -181.5, -242, 363, 484);
    g.globalAlpha = x; g.drawImage(bmH, -181.5, -242, 363, 484); g.restore(); g.globalAlpha = 1;
    // rings
    g.globalCompositeOperation = "lighter";
    for (const rg of rings) {
      rg.t += dt * 1; const q = rg.t / 1.1; if (q < 0 || q > 1) continue;
      g.strokeStyle = hexRgba("#ffb347", (1 - q) * 0.9); g.lineWidth = 7 * (1 - q) + 1;
      g.beginPath(); g.arc(rg.x, rg.y, 60 + easeOutCubic(q) * 900, 0, 7); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    // texts
    const pop = (d) => easeOutBack((u - d) / 0.55);
    const popA = (d) => clamp((u - d) / 0.3);
    {
      const p0 = pop(0.45); g.save(); g.translate(W / 2, 112); g.scale(p0 || 0.001, p0 || 0.001); g.globalAlpha = popA(0.45);
      const a = "ПЕРЕМОЖЕЦЬ", b = `Раунд ${r.info.round} з ${r.info.totalRounds}`, sep = "   ·   ", size = 64, ls = 6;
      const wa = textW(a, size, 800, ls), ws = textW(sep, size, 800, ls), wb = textW(b, size, 800, 1), tot = wa + ws + wb;
      g.shadowColor = "rgba(255,102,0,.8)"; g.shadowBlur = 30;
      text(a, -tot / 2, 0, size, 800, "#ffb347", "left", ls);
      g.shadowBlur = 0;
      text(sep, -tot / 2 + wa, 0, size, 800, "#ff6600", "left", ls);
      text(b, -tot / 2 + wa + ws, 0, size, 800, "#f4f1ea", "left", 1);
      g.restore();
    }
    {
      const nm = r.winner.name;
      const maxW = 1560;
      const fs = clamp(fitSize(nm, 800, 168, maxW), 60, 168);
      const p1 = pop(0.75); g.save(); g.translate(W / 2, 800); g.scale(p1 || 0.001, p1 || 0.001); g.globalAlpha = popA(0.75);
      g.shadowColor = "rgba(0,0,0,.9)"; g.shadowBlur = 36; g.shadowOffsetY = 6;
      text(nm, 0, 0, fs, 800, "#fff", "center");
      g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.restore();
      if (r.winner.handle) {
        const p2 = pop(1.0); g.save(); g.translate(W / 2, 906); g.scale(p2 || 0.001, p2 || 0.001); g.globalAlpha = popA(1.0);
        g.shadowColor = "rgba(0,0,0,.9)"; g.shadowBlur = 20;
        text(r.winner.handle, 0, 0, clamp(fitSize(r.winner.handle, 700, 78, 1200), 40, 78), 700, "#7cff4f", "center", 1);
        g.restore();
      }
      const tt = r.winner.tickets, tot = r.info.totalTickets;
      const pct = tot ? (tt / tot) * 100 : 0;
      const info = `${R.n}   ·   ${tt} ${plural(tt)}${tot ? `   ·   шанс ${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%` : ""}`;
      const p3 = pop(1.25); g.save(); g.translate(W / 2, 992); g.scale(p3 || 0.001, p3 || 0.001); g.globalAlpha = popA(1.25);
      const iw = textW(info, 30, 700, 3) + 60;
      g.fillStyle = hexRgba(R.c, 0.18); rrect(g, -iw / 2, -26, iw, 52, 26); g.fill();
      g.strokeStyle = hexRgba(R.c, 0.9); g.lineWidth = 2.5; g.stroke();
      text(info, 0, 1, 30, 700, "#f4f1ea", "center", 3);
      g.restore();
    }
    // ambient embers after burst
    if (u > 1.2 && Math.random() < 0.5) {
      particles.push({ x: rnd(0, W), y: H + 10, vx: rnd(-40, 40), vy: -rnd(120, 360), g: -30, life: 0, max: rnd(3, 6), sz: rnd(3, 8), col: Math.random() < 0.7 ? "#ff8a1f" : "#ffc83a", kind: 0, rot: 0, vr: 0, drag: 0.2 });
    }
    if (u > 1.4 && u % 2.6 < dt && !reduced()) burst(rnd(300, W - 300), rnd(160, 480), 70, 0.45);
    if (u > 0.5 && !r.done && u > 1.9) { r.done = true; r.resolve?.(); }
  }

  function fitSize(str, weight, size, maxW) {
    g.font = `${weight} ${size}px ${FONT}`;
    const w = g.measureText(str).width;
    return w > maxW ? size * maxW / w : size;
  }

  function drawParticles(dt) {
    if (!particles.length) return;
    g.globalCompositeOperation = "lighter";
    let w = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life += dt; if (p.life >= p.max) continue;
      const dr = Math.pow(p.drag * 0.05 + 0.0, dt) ;
      p.vx *= Math.pow(0.3, dt * p.drag); p.vy = p.vy * Math.pow(0.3, dt * p.drag) + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; void dr;
      const q = p.life / p.max, al = (1 - q) * (1 - q);
      if (p.kind === 1) {
        g.globalCompositeOperation = "source-over"; g.globalAlpha = al;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); const s = 26 + p.sz * 2; g.drawImage(pumpkin, -s / 2, -s / 2 * 0.94, s, s * 0.94); g.restore();
        g.globalCompositeOperation = "lighter";
      } else {
        g.globalAlpha = al;
        g.fillStyle = p.col;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz * 0.6); g.restore();
        g.globalAlpha = al * 0.5; g.drawImage(glowSprite(p.col), p.x - p.sz * 2.2, p.y - p.sz * 2.2, p.sz * 4.4, p.sz * 4.4);
      }
      particles[w++] = p;
    }
    particles.length = w;
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  // ---------------------------------------------------------------- frame
  let lastDt = 1 / 60;
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - last); last = now; lastDt = dt;
    if (!CW || !CH) return;

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

    drawBackground(now);
    const wallA = mode === "idle" ? idleIn : mode === "strip" ? lerp(1, 0.18, smooth((rollState?.stripA ?? 0))) : 0.0;
    const busy = mode !== "idle";
    drawSwarm(now, busy ? 0.55 : 1);
    drawFog(now, 1);
    if (mode === "idle" || (mode === "strip" && wallA > 0.02)) drawWall(now, wallA);
    // bats
    for (const b of bats) {
      b.x += b.vx * dt * (busy ? 1.6 : 1);
      if (b.vx > 0 && b.x > W + 120) { b.x = -120; b.y = rnd(100, 600); }
      if (b.vx < 0 && b.x < -120) { b.x = W + 120; b.y = rnd(100, 600); }
      drawBat(b, now);
    }
    if (mode === "idle") { drawHeader(now, idleIn); drawMascot(now, idleIn); }
    else if (mode === "strip" && wallA > 0.3) { drawHeader(now, wallA * (1 - rollState.stripA)); }
    // shake
    g.save();
    if (shake > 0 && mode === "win") { shake = Math.max(0, shake - dt * 2.2); g.translate(rnd(-1, 1) * 14 * shake, rnd(-1, 1) * 14 * shake); }
    if (rollState && (mode === "strip" || mode === "win")) drawStrip(now);
    if (mode === "win") drawWin(now, dt);
    drawParticles(dt);
    g.restore();
    if (flash > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(255,214,150,${flash * 0.75})`; g.fillRect(0, 0, CW, CH);
      flash = Math.max(0, flash - dt * 2.8);
      g.setTransform(S, 0, 0, S, OX, OY);
    }
    // vignette
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(vigC, 0, 0);
    // letterbox masks keep the 16:9 art clean on odd aspect ratios
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
        cardBitmap(winner, 363, "hero"); cardBitmap(winner, 363, "name");
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
