// Drawing of «Лото Забава»: lottery balls (shaded pixel spheres), the glass drum and the suction tube.
// Everything is drawn in design pixels (1920×1080); round shapes go through low-res layers so they come
// out as hard art pixels like the scene pictures.
import * as px from "../pixel-kit.js";

const { PAL } = px;
const P = px.PX;

// ---------------------------------------------------------------- layout (design pixels)
export const DRUM = { cx: 600, cy: 480, r: 290, rim: 310 };
export const PEDESTAL = { cx: 600, top: 770, w: 500 };
export const PUMP = { x: 1560, y: 60, w: 220 };
// the sprite's connectors as fractions of its size (loto-pump.webp, trimmed)
export const PUMP_IN = { x: PUMP.x + 0.049 * PUMP.w, y: PUMP.y + 0.498 * PUMP.w * 1407 / 948 };
export const PUMP_OUT = { x: PUMP.x + 0.518 * PUMP.w, y: PUMP.y + 0.957 * PUMP.w * 1407 / 948 };
export const HOLDER = { cx: PUMP_OUT.x, top: 520, w: 240, ballY: 548 };
export const MOUTH = { x: DRUM.cx, y: DRUM.cy - DRUM.r + 22 };
export const TUBE_R = 38; // inner radius of the glass tube

// ---------------------------------------------------------------- tiers (colour by share of tickets)
export const TIERS = [
  { c: "#a59cb8", d: "#4b4560" },
  { c: "#7cff4f", d: "#1f5c10" },
  { c: "#a46bff", d: "#3d1a7a" },
  { c: "#ff6600", d: "#7a2c00" },
  { c: "#ffd36b", d: "#8a5a00" },
];

// ---------------------------------------------------------------- ball sprite
const sphereCache = new Map();
/** A shaded pixel sphere of radius r (design px) in tier colours, drawn at art pixel q; returns a canvas of 2r. */
export function sphere(tier, r, q = 3) {
  const key = `${tier}|${Math.round(r)}|${q}`;
  let c = sphereCache.get(key);
  if (c) return c;
  const T = TIERS[tier], n = Math.max(6, Math.round((2 * r) / q));
  const small = px.canvas(n, n), g = small.getContext("2d"), im = g.createImageData(n, n);
  const base = hex(T.c), dark = hex(T.d), ink = hex(PAL.ink), bone = hex(PAL.bone);
  const L = norm([-0.55, -0.6, 0.58]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1, d2 = u * u + v * v;
    if (d2 > 1) continue;
    const i = (y * n + x) * 4;
    let col;
    if (d2 > Math.pow(1 - 1.6 / n, 2)) col = ink; // 1 art pixel outline
    else {
      const z = Math.sqrt(1 - d2), lam = Math.max(0, u * L[0] + v * L[1] + z * L[2]);
      const spec = Math.pow(lam, 18);
      const step = Math.round((0.18 + lam * 0.95) * 3) / 3; // 4 hard shades
      col = mix(dark, base, Math.min(1, step));
      if (spec > 0.55) col = bone; else if (spec > 0.25) col = mix(col, bone, 0.5);
    }
    im.data[i] = col[0]; im.data[i + 1] = col[1]; im.data[i + 2] = col[2]; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  c = small;
  sphereCache.set(key, c);
  return c;
}

const labelCache = new Map();
/** The white number disc of a ball (art pixels), radius r. */
export function label(r, q = 2) {
  const key = `${Math.round(r)}|${q}`;
  let c = labelCache.get(key);
  if (c) return c;
  const n = Math.max(4, Math.round((2 * r) / q));
  c = px.canvas(n, n);
  const g = c.getContext("2d"), im = g.createImageData(n, n), bone = hex(PAL.bone), ink = hex("#2a1838");
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1, d2 = u * u + v * v;
    if (d2 > 1) continue;
    const col = d2 > Math.pow(1 - 1.4 / n, 2) ? ink : bone, i = (y * n + x) * 4;
    im.data[i] = col[0]; im.data[i + 1] = col[1]; im.data[i + 2] = col[2]; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  labelCache.set(key, c);
  return c;
}

/**
 * One lottery ball at x,y: sphere + a number disc that rolls with `spin`. o: { scale, alpha, avatar, ring }.
 * The number is drawn when the ball is big enough to read it.
 */
export function drawBall(g, b, x, y, o = {}) {
  const sc = o.scale ?? 1, r = b.r * sc, a = o.alpha ?? 1;
  if (a <= 0.01) return;
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.globalAlpha = a;
  if (o.ring) px.glow(g, x, y, r * 4.5, o.ring, 0.7);
  const sp = sphere(b.tier, b.r, b.r > 60 ? 4 : 3);
  g.drawImage(sp, Math.round(x - r), Math.round(y - r), 2 * r, 2 * r);
  // the number disc rolls around the ball
  const off = r * 0.26, lx = x + Math.cos(b.spin) * off, ly = y + Math.sin(b.spin) * off * 0.7;
  const squash = 0.78 + 0.22 * Math.abs(Math.sin(b.spin));
  const lr = r * 0.56;
  const lb = label(b.r * 0.56, b.r > 60 ? 4 : 2);
  g.drawImage(lb, Math.round(lx - lr * squash), Math.round(ly - lr), 2 * lr * squash, 2 * lr);
  if (o.avatar && r > 44) {
    const s2 = px.snap(lr * 1.3);
    px.photo(g, o.avatar, lx - s2 / 2, ly - s2 / 2, s2, r > 100 ? P * 2 : P);
  } else if (r >= 15) {
    const str = String(b.num), fs = Math.max(10, Math.min(lr * 1.05, (lr * 1.75 * squash) / (0.62 * str.length)));
    px.text(g, str, lx, ly + fs * 0.06, { size: fs, color: PAL.ink, ink: false, align: "center" });
  }
  if (o.ring) px.circle(g, x, y, r + 2 * P, o.ring, 1, P);
  g.globalAlpha = 1;
  g.imageSmoothingEnabled = s;
}

// ---------------------------------------------------------------- tube path
/** The centre line of the tube from the drum mouth to the pump, sampled every few px with arc length. */
export function buildTube() {
  const pts = [];
  const add = (x, y) => pts.push({ x, y });
  const line = (x0, y0, x1, y1, n = 20) => { for (let i = 0; i <= n; i++) add(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); };
  const cubic = (a, b, c, d, n = 40) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      add(u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
          u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]);
    }
  };
  line(MOUTH.x, MOUTH.y, MOUTH.x, 150, 12);
  cubic([MOUTH.x, 150], [MOUTH.x, 70], [MOUTH.x + 60, 64], [760, 64]);
  line(760, 64, 960, 64, 20);
  // a loop-de-loop drifting right so that the way out does not overlap the way in
  const LX = 960, LY = 64 + 96, LR = 96, drift = 90;
  for (let i = 0; i <= 90; i++) {
    const th = (i / 90) * Math.PI * 2;
    add(LX + Math.sin(th) * LR + (drift * th) / (Math.PI * 2), LY - Math.cos(th) * LR);
  }
  line(LX + drift, 64, 1380, 64, 30);
  cubic([1380, 64], [1500, 64], [PUMP_IN.x - 110, PUMP_IN.y], [PUMP_IN.x + 4, PUMP_IN.y]);
  return withLength(pts);
}

/** The short drop from the pump outlet into the holder. */
export function buildDrop() {
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: PUMP_OUT.x, y: PUMP_OUT.y - 6 + (HOLDER.ballY - PUMP_OUT.y + 6) * i / 20 });
  return withLength(pts);
}

function withLength(pts) {
  let L = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = L; }
  return { pts, length: L };
}

/** Point at arc length s. */
export function at(path, s) {
  const { pts } = path;
  if (s <= 0) return pts[0];
  if (s >= path.length) return pts[pts.length - 1];
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s < s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Pre-render the tube into two low-res layers: the glass body (behind the ball) and the shine (in front). */
export function renderTube(paths) {
  const back = px.lowres(1920, 1080), front = px.lowres(1920, 1080);
  const stroke = (g, path, w, color, alpha = 1, dx = 0, dy = 0) => {
    g.save();
    g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    path.pts.forEach((p, i) => (i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy)));
    g.stroke(); g.restore();
  };
  const gb = back.begin();
  for (const p of paths) stroke(gb, p, 2 * TUBE_R + 16, PAL.ink, 1);
  for (const p of paths) stroke(gb, p, 2 * TUBE_R + 6, "#5a4a78", 1);
  for (const p of paths) stroke(gb, p, 2 * TUBE_R - 2, "#1d1430", 1);
  for (const p of paths) stroke(gb, p, 2 * TUBE_R - 18, "#2a1d44", 0.9);
  const gf = front.begin();
  for (const p of paths) stroke(gf, p, 8, PAL.bone, 0.32, -6, -TUBE_R + 14);
  for (const p of paths) stroke(gf, p, 4, PAL.bone, 0.18, 4, TUBE_R - 12);
  // brass collars every ~260 px
  for (const p of paths) {
    for (let s = 120; s < p.length - 40; s += 260) {
      const a = at(p, s), b = at(p, s + 6), ang = Math.atan2(b.y - a.y, b.x - a.x);
      gf.save(); gf.translate(a.x, a.y); gf.rotate(ang);
      gf.fillStyle = PAL.ink; gf.fillRect(-12, -TUBE_R - 12, 24, 2 * TUBE_R + 24);
      gf.fillStyle = "#c9932e"; gf.fillRect(-8, -TUBE_R - 8, 16, 2 * TUBE_R + 16);
      gf.fillStyle = PAL.gold; gf.fillRect(-8, -TUBE_R - 8, 4, 2 * TUBE_R + 16);
      gf.restore();
    }
  }
  return { back, front };
}

// ---------------------------------------------------------------- the drum
/** Back of the drum: dark glass disc with a faint violet tint (low-res layer). */
export function drumBack(g) {
  const { cx, cy, rim } = DRUM;
  g.fillStyle = "#120b1c"; g.globalAlpha = 0.82;
  g.beginPath(); g.arc(cx, cy, rim, 0, 7); g.fill();
  g.globalAlpha = 0.5; g.strokeStyle = "#3a2856"; g.lineWidth = 8;
  for (const k of [0.45, 0.75]) { g.beginPath(); g.arc(cx, cy, rim * k, 0, 7); g.stroke(); }
  g.globalAlpha = 1;
}

/** Front of the drum: brass rim with rivets that turn with the drum, the vanes, the hub, glass shine. */
export function drumFront(g, ang, vanes, glowMouth) {
  const { cx, cy, rim } = DRUM;
  // vanes
  for (const v of vanes) {
    g.strokeStyle = PAL.ink; g.lineWidth = 18; g.lineCap = "round";
    g.beginPath(); g.moveTo(v.x0, v.y0); g.lineTo(v.x1, v.y1); g.stroke();
    g.strokeStyle = "#c9932e"; g.lineWidth = 10;
    g.beginPath(); g.moveTo(v.x0, v.y0); g.lineTo(v.x1, v.y1); g.stroke();
  }
  // spokes + hub (thin, behind the shine)
  g.globalAlpha = 0.55; g.strokeStyle = "#8a6a2a"; g.lineWidth = 6;
  for (let k = 0; k < 4; k++) {
    const a = ang + Math.PI / 4 + (k * Math.PI) / 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (rim - 30), cy + Math.sin(a) * (rim - 30)); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.fill();
  g.fillStyle = "#c9932e"; g.beginPath(); g.arc(cx, cy, 22, 0, 7); g.fill();
  g.fillStyle = PAL.gold; g.beginPath(); g.arc(cx - 6, cy - 6, 8, 0, 7); g.fill();
  // rim
  g.strokeStyle = PAL.ink; g.lineWidth = 40; g.beginPath(); g.arc(cx, cy, rim + 6, 0, 7); g.stroke();
  g.strokeStyle = "#8a5a12"; g.lineWidth = 28; g.beginPath(); g.arc(cx, cy, rim + 6, 0, 7); g.stroke();
  g.strokeStyle = "#c9932e"; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, rim + 4, 0, 7); g.stroke();
  g.strokeStyle = PAL.gold; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, rim + 4, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  // rivets turn with the drum
  for (let k = 0; k < 16; k++) {
    const a = ang + (k * Math.PI * 2) / 16, x = cx + Math.cos(a) * (rim + 6), y = cy + Math.sin(a) * (rim + 6);
    g.fillStyle = PAL.ink; g.fillRect(x - 7, y - 7, 14, 14);
    g.fillStyle = k % 4 ? PAL.amber : PAL.orange; g.fillRect(x - 4, y - 4, 8, 8);
  }
  // glass shine
  g.strokeStyle = PAL.bone; g.lineCap = "round";
  g.globalAlpha = 0.22; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, rim - 34, Math.PI * 1.1, Math.PI * 1.42); g.stroke();
  g.globalAlpha = 0.12; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, rim - 60, Math.PI * 0.15, Math.PI * 0.35); g.stroke();
  g.globalAlpha = 1;
  // the funnel of the tube inside the drum
  const m = MOUTH;
  g.fillStyle = PAL.ink; g.beginPath();
  g.moveTo(m.x - TUBE_R - 26, m.y + 34); g.lineTo(m.x + TUBE_R + 26, m.y + 34); g.lineTo(m.x + TUBE_R + 8, m.y - 30); g.lineTo(m.x - TUBE_R - 8, m.y - 30); g.fill();
  g.fillStyle = glowMouth > 0 ? PAL.orange : "#c9932e"; g.beginPath();
  g.moveTo(m.x - TUBE_R - 18, m.y + 28); g.lineTo(m.x + TUBE_R + 18, m.y + 28); g.lineTo(m.x + TUBE_R + 4, m.y - 26); g.lineTo(m.x - TUBE_R - 4, m.y - 26); g.fill();
  g.fillStyle = "#1d1430"; g.fillRect(m.x - TUBE_R + 4, m.y + 14, 2 * TUBE_R - 8, 14);
}

// ---------------------------------------------------------------- colour helpers
function hex(h) { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
function mix(a, b, t) { return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)); }
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
