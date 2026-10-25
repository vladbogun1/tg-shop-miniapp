// Graveyard visual: everything that is baked once into offscreen canvases (stones, pumpkins,
// glows, fog, sky, gate, trees). Pure canvas 2D, no assets required.
export const SW = 320, SH = 440, GY = 402; // stone bitmap size and the line the stone stands on
export const TIER_H = [235, 282, 326, 356];

export const cv = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- stones
function shape(tier, v) {
  const H = TIER_H[tier - 1], top = GY - H;
  const main = new Path2D();
  const extra = [];
  if (tier === 1) {
    if (v === 0) { main.moveTo(40, GY); main.lineTo(40, top + 120); main.arc(160, top + 120, 120, Math.PI, 0); main.lineTo(280, GY); main.closePath(); }
    else { main.moveTo(40, GY); main.lineTo(40, top + 50); main.lineTo(90, top); main.lineTo(230, top); main.lineTo(280, top + 50); main.lineTo(280, GY); main.closePath(); }
  } else if (tier === 2) {
    main.moveTo(40, GY);
    if (v === 0) {
      main.lineTo(40, top + 130); main.bezierCurveTo(40, top + 30, 110, top, 160, top);
      main.bezierCurveTo(210, top, 280, top + 30, 280, top + 130);
    } else {
      main.lineTo(40, top + 92); main.bezierCurveTo(40, top + 40, 118, top + 58, 160, top);
      main.bezierCurveTo(202, top + 58, 280, top + 40, 280, top + 92);
    }
    main.lineTo(280, GY); main.closePath();
  } else {
    main.moveTo(40, GY); main.lineTo(40, top + (tier === 3 ? 160 : 150));
    main.bezierCurveTo(40, top + 92, 98, top + 50, 160, top);
    main.bezierCurveTo(222, top + 50, 280, top + 92, 280, top + (tier === 3 ? 160 : 150));
    main.lineTo(280, GY); main.closePath();
    if (tier === 3 && v === 1) {
      for (const sx of [-1, 1]) { const p = new Path2D(); const cx = 160 + sx * 128; p.moveTo(cx - 14, GY - 150); p.lineTo(cx, top + 78); p.lineTo(cx + 14, GY - 150); p.closePath(); extra.push(p); }
    }
    if (tier === 4) {
      const pl = new Path2D(); pl.rect(26, GY - 42, 268, 42); extra.push(pl);
      const f1 = new Path2D(); f1.rect(153, top - 38, 14, 54); extra.push(f1);
      const f2 = new Path2D(); f2.rect(139, top - 24, 42, 12); extra.push(f2);
    }
  }
  return { main, extra, H, top };
}

const PAL = ["#6f789f", "#454b69", "#232739"];
const PAL_LIT = ["#dcb383", "#9d6c45", "#4d3022"];

function engrave(g, lit, draw) {
  g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 3;
  g.strokeStyle = g.fillStyle = lit ? "rgba(255,236,190,.4)" : "rgba(190,205,255,.24)";
  g.translate(0, 1.8); draw(g); g.restore();
  g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 3;
  g.strokeStyle = g.fillStyle = lit ? "rgba(45,22,8,.75)" : "rgba(5,7,15,.68)";
  draw(g); g.restore();
}

function skull(g, x, y, s) {
  g.beginPath(); g.ellipse(x, y - 3 * s, 20 * s, 18 * s, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x - 11 * s, y + 12 * s); g.lineTo(x - 11 * s, y + 24 * s); g.lineTo(x + 11 * s, y + 24 * s); g.lineTo(x + 11 * s, y + 12 * s); g.stroke();
  g.beginPath(); g.ellipse(x - 8 * s, y - 3 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(x + 8 * s, y - 3 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x, y + 4 * s); g.lineTo(x - 3 * s, y + 10 * s); g.lineTo(x + 3 * s, y + 10 * s); g.closePath(); g.fill();
  g.beginPath(); for (let i = -1; i <= 1; i++) { g.moveTo(x + i * 5 * s, y + 14 * s); g.lineTo(x + i * 5 * s, y + 24 * s); } g.stroke();
}

function emblem(g, tier, v, lit, y) {
  engrave(g, lit, (g) => {
    if (tier === 1) {
      g.beginPath(); g.moveTo(160, y - 22); g.lineTo(160, y + 24); g.moveTo(143, y - 8); g.lineTo(177, y - 8); g.stroke();
    } else if (tier === 2) {
      if (v === 0) {
        g.beginPath(); g.ellipse(160, y + 4, 26, 20, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.ellipse(160, y + 4, 11, 20, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(160, y - 16); g.lineTo(164, y - 27); g.stroke();
      } else {
        g.beginPath(); g.arc(160, y, 20, 0.5, Math.PI * 2 - 0.5); g.arc(168, y, 15, Math.PI * 2 - 0.9, 0.9, true); g.stroke();
        g.beginPath(); g.arc(188, y - 16, 3, 0, 7); g.fill();
      }
    } else if (tier === 3) skull(g, 160, y, 1.15);
    else {
      skull(g, 160, y + 4, 1.05);
      g.beginPath();
      for (const s of [-1, 1]) { g.moveTo(160 + s * 26, y); g.quadraticCurveTo(160 + s * 62, y - 36, 160 + s * 88, y - 4); g.quadraticCurveTo(160 + s * 70, y + 4, 160 + s * 60, y + 18); g.moveTo(160 + s * 40, y + 6); g.quadraticCurveTo(160 + s * 62, y - 6, 160 + s * 76, y + 4); }
      g.stroke();
    }
  });
}

function mound(g, lit, R) {
  const gr = g.createRadialGradient(160, GY - 8, 8, 160, GY + 4, 150);
  gr.addColorStop(0, lit ? "#3a2a22" : "#2b2433"); gr.addColorStop(1, lit ? "#150e0c" : "#0f0c15");
  g.fillStyle = gr; g.beginPath(); g.ellipse(160, GY + 4, 142, 27, 0, 0, Math.PI * 2); g.fill();
  g.lineCap = "round";
  const cols = ["#1e3a24", "#2d4d2c", "#183021", "#3a5a30"];
  for (let i = 0; i < 90; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R());
    const x = 160 + Math.cos(a) * 132 * rr, y = GY + 3 + Math.sin(a) * 22 * rr;
    const h = 7 + R() * 15, bend = (R() - 0.5) * 9;
    g.strokeStyle = cols[(R() * cols.length) | 0]; g.lineWidth = 1.6 + R() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bend * 0.4, y - h * 0.6, x + bend, y - h); g.stroke();
  }
  for (let i = 0; i < 6; i++) { g.fillStyle = ["#a2461a", "#7a3515", "#c2651f"][i % 3]; g.beginPath(); g.ellipse(70 + R() * 180, GY + 4 + R() * 14, 4 + R() * 3, 2, R() * 3, 0, 7); g.fill(); }
}

function bakeStone(tier, v, lit) {
  const c = cv(SW, SH), g = c.getContext("2d");
  const R = rng(tier * 131 + v * 17 + 9);
  const { main, extra, H, top } = shape(tier, v);
  const pal = lit ? PAL_LIT : PAL;
  if (tier === 4) { g.save(); g.shadowColor = lit ? "rgba(255,170,70,.9)" : "rgba(255,102,0,.55)"; g.shadowBlur = 22; g.fillStyle = "#222"; g.fill(main); g.restore(); }
  const body = g.createLinearGradient(40, 0, 290, 0);
  body.addColorStop(0, pal[0]); body.addColorStop(0.5, pal[1]); body.addColorStop(1, pal[2]);
  g.fillStyle = body; g.fill(main); for (const e of extra) g.fill(e);
  g.save(); g.clip(main);
  const vg = g.createLinearGradient(0, top, 0, GY);
  vg.addColorStop(0, "rgba(210,225,255,.2)"); vg.addColorStop(0.45, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(6,8,14,.62)");
  g.fillStyle = vg; g.fillRect(0, top - 10, SW, H + 20);
  for (let i = 0; i < 320; i++) {
    g.fillStyle = R() < 0.55 ? `rgba(8,10,20,${0.05 + R() * 0.12})` : `rgba(210,220,255,${0.03 + R() * 0.09})`;
    const s = 1 + R() * 2.6; g.fillRect(34 + R() * 250, top + R() * H, s, s);
  }
  for (let i = 0; i < 8; i++) { g.strokeStyle = `rgba(6,8,16,${0.07 + R() * 0.09})`; g.lineWidth = 2 + R() * 4; const x = 50 + R() * 220; g.beginPath(); g.moveTo(x, top + 20 + R() * 60); g.lineTo(x + (R() - 0.5) * 12, GY); g.stroke(); }
  for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${lit ? "120,150,70" : "50,92,56"},${0.22 + R() * 0.22})`; g.beginPath(); g.ellipse(55 + R() * 210, GY - 6 - R() * 46, 22 + R() * 30, 9 + R() * 12, 0, 0, 7); g.fill(); }
  if (tier <= 2) { // a crack
    g.strokeStyle = "rgba(4,6,12,.55)"; g.lineWidth = 2; g.beginPath();
    let x = 70 + R() * 180, y = top + 30 + R() * 40; g.moveTo(x, y);
    for (let i = 0; i < 6; i++) { x += (R() - 0.5) * 22; y += 12 + R() * 14; g.lineTo(x, y); }
    g.stroke();
  }
  if (lit) { const rg = g.createRadialGradient(160, GY - H * 0.45, 10, 160, GY - H * 0.45, 190); rg.addColorStop(0, "rgba(255,185,100,.3)"); rg.addColorStop(1, "rgba(255,120,30,0)"); g.fillStyle = rg; g.fillRect(0, 0, SW, SH); }
  if (tier >= 2) { // inset frame
    g.save(); g.beginPath(); g.rect(0, 0, SW, GY - 16); g.clip();
    g.translate(160, GY); g.scale(0.84, 0.9); g.translate(-160, -GY);
    g.lineWidth = 3.5; g.translate(0, 1.6); g.strokeStyle = lit ? "rgba(255,236,190,.28)" : "rgba(190,205,255,.18)"; g.stroke(main);
    g.translate(0, -1.6); g.strokeStyle = lit ? "rgba(45,22,8,.6)" : "rgba(5,7,15,.55)"; g.stroke(main); g.restore();
  }
  g.restore();
  emblem(g, tier, v, lit, GY - H * 0.67);
  engrave(g, lit, (g) => { g.beginPath(); g.moveTo(112, GY - H * 0.38 + 34); g.lineTo(208, GY - H * 0.38 + 34); g.stroke(); });
  if (tier === 4) { // candles on the plinth
    for (const x of [48, 272]) {
      g.fillStyle = "#e9dfc8"; g.fillRect(x - 6, GY - 66, 12, 26);
      g.fillStyle = "#ffdc7a"; g.beginPath(); g.ellipse(x, GY - 76, 5, 10, 0, 0, 7); g.fill();
      g.fillStyle = "#fff6c8"; g.beginPath(); g.ellipse(x, GY - 74, 2.2, 5, 0, 0, 7); g.fill();
    }
  }
  const eg = g.createLinearGradient(40, 0, 280, 0);
  eg.addColorStop(0, lit ? "rgba(255,225,170,.8)" : "rgba(190,210,255,.5)"); eg.addColorStop(0.35, "rgba(190,210,255,0)");
  g.strokeStyle = eg; g.lineWidth = 3; g.stroke(main);
  mound(g, lit, R);
  return c;
}

function bakeBroken() {
  const c = cv(SW, SH), g = c.getContext("2d"); const R = rng(77);
  mound(g, false, R);
  const gl = g.createRadialGradient(160, GY - 6, 4, 160, GY - 6, 70);
  gl.addColorStop(0, "rgba(124,255,79,.85)"); gl.addColorStop(1, "rgba(124,255,79,0)");
  g.fillStyle = gl; g.fillRect(70, GY - 80, 180, 100);
  g.fillStyle = "#06070b"; g.beginPath(); g.ellipse(160, GY - 2, 36, 9, 0, 0, 7); g.fill();
  const body = g.createLinearGradient(40, 0, 290, 0); body.addColorStop(0, "#4a5072"); body.addColorStop(1, "#1c2032");
  g.fillStyle = body;
  g.beginPath(); g.moveTo(44, GY); g.lineTo(44, GY - 152); g.lineTo(66, GY - 170); g.lineTo(88, GY - 140); g.lineTo(112, GY - 178); g.lineTo(130, GY - 118); g.lineTo(146, GY - 134); g.lineTo(140, GY); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(184, GY); g.lineTo(196, GY - 82); g.lineTo(226, GY - 112); g.lineTo(252, GY - 92); g.lineTo(284, GY - 40); g.lineTo(284, GY); g.closePath(); g.fill();
  g.strokeStyle = "rgba(190,210,255,.35)"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(44, GY - 150); g.lineTo(44, GY); g.stroke();
  g.fillStyle = "rgba(124,255,79,.25)"; g.beginPath(); g.ellipse(160, GY - 8, 60, 14, 0, 0, 7); g.fill();
  return c;
}

export function bakeStones() {
  const out = { s: {}, broken: bakeBroken(), meta: {} };
  for (let t = 1; t <= 4; t++) {
    out.meta[t] = { nameY: GY - TIER_H[t - 1] * 0.38, emblemY: GY - TIER_H[t - 1] * 0.67 };
    for (let v = 0; v < 2; v++) out.s[`${t}${v}`] = [bakeStone(t, v, false), bakeStone(t, v, true)];
  }
  return out;
}

// ---------------------------------------------------------------- small sprites
export function bakePumpkin() {
  const c = cv(120, 104), g = c.getContext("2d");
  const lobe = (x, y, rx, ry) => {
    const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 2, x, y, Math.max(rx, ry));
    gr.addColorStop(0, "#ffb347"); gr.addColorStop(0.55, "#ff6600"); gr.addColorStop(1, "#a83a00");
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
  };
  lobe(34, 64, 26, 30); lobe(86, 64, 26, 30); lobe(60, 62, 36, 34);
  g.strokeStyle = "rgba(110,36,0,.55)"; g.lineWidth = 2;
  for (const dx of [-14, 14]) { g.beginPath(); g.ellipse(60 + dx, 62, 12, 33, 0, 0, 7); g.stroke(); }
  g.fillStyle = "#4b3a1a"; g.beginPath(); g.moveTo(54, 30); g.lineTo(58, 14); g.lineTo(68, 12); g.lineTo(66, 30); g.closePath(); g.fill();
  g.strokeStyle = "#7cff4f"; g.lineWidth = 3; g.beginPath(); g.moveTo(66, 20); g.quadraticCurveTo(84, 8, 90, 20); g.stroke();
  g.save(); g.shadowColor = "#ffb000"; g.shadowBlur = 10; g.fillStyle = "#ffeb8a";
  g.beginPath(); g.moveTo(40, 58); g.lineTo(54, 58); g.lineTo(47, 46); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(66, 58); g.lineTo(80, 58); g.lineTo(73, 46); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(36, 72); g.lineTo(46, 80); g.lineTo(53, 73); g.lineTo(60, 82); g.lineTo(67, 73); g.lineTo(74, 80); g.lineTo(84, 72); g.lineTo(78, 88); g.lineTo(60, 92); g.lineTo(42, 88); g.closePath(); g.fill();
  g.restore();
  return c;
}

export function bakeGlow(r, gr, b, soft = 1) {
  const c = cv(128, 128), g = c.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, `rgba(${r},${gr},${b},1)`); rg.addColorStop(0.25 * soft, `rgba(${r},${gr},${b},.55)`);
  rg.addColorStop(0.6, `rgba(${r},${gr},${b},.16)`); rg.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return c;
}

export function bakeFog(seed, tint) {
  const w = 1024, h = 256, c = cv(w, h), g = c.getContext("2d"), R = rng(seed);
  for (let i = 0; i < 46; i++) {
    const x = R() * w, y = h * (0.3 + R() * 0.5), r = 50 + R() * 110, a = 0.05 + R() * 0.11;
    for (const ox of [-w, 0, w]) {
      const rg = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      rg.addColorStop(0, `rgba(${tint},${a})`); rg.addColorStop(1, `rgba(${tint},0)`);
      g.fillStyle = rg; g.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  const mask = g.createLinearGradient(0, 0, 0, h); // fade top and bottom edges
  mask.addColorStop(0, "rgba(0,0,0,1)"); mask.addColorStop(0.28, "rgba(0,0,0,0)"); mask.addColorStop(0.72, "rgba(0,0,0,0)"); mask.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out"; g.fillStyle = mask; g.fillRect(0, 0, w, h);
  return c;
}

// ---------------------------------------------------------------- background
export function bakeSky(W, H, hy) {
  const c = cv(W, H), g = c.getContext("2d"), R = rng(5);
  const gr = g.createLinearGradient(0, 0, 0, hy + 30);
  gr.addColorStop(0, "#04030a"); gr.addColorStop(0.5, "#0d0820"); gr.addColorStop(0.85, "#241238"); gr.addColorStop(1, "#4a1d36");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const ground = g.createLinearGradient(0, hy, 0, H);
  ground.addColorStop(0, "#1a1328"); ground.addColorStop(0.35, "#0f0c17"); ground.addColorStop(1, "#07060a");
  g.fillStyle = ground; g.fillRect(0, hy, W, H - hy);
  for (const [x, col, rx] of [[W * 0.5, "rgba(255,102,0,.16)", W * 0.55], [W * 0.15, "rgba(138,63,252,.2)", W * 0.4], [W * 0.88, "rgba(138,63,252,.14)", W * 0.35]]) {
    g.save(); g.translate(x, hy + 4); g.scale(1, 0.22); const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx); rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
  }
  for (let i = 0; i < 190; i++) {
    const x = R() * W, y = R() * hy * 0.92, a = 0.25 + R() * 0.6, s = R() < 0.1 ? 1.8 : R() < 0.4 ? 1.2 : 0.8;
    g.fillStyle = `rgba(${R() < 0.2 ? "255,214,170" : "205,220,255"},${a * (1 - y / hy * 0.55)})`; g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.018})`; g.fillRect(R() * W, R() * H, 1, 1); } // dither
  return c;
}

export function bakeMoon() {
  const S = 640, c = cv(S, S), g = c.getContext("2d"), m = S / 2, R = rng(11);
  let rg = g.createRadialGradient(m, m, 60, m, m, m);
  rg.addColorStop(0, "rgba(190,205,255,.34)"); rg.addColorStop(0.35, "rgba(150,160,240,.12)"); rg.addColorStop(1, "rgba(120,120,220,0)");
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  const d = g.createRadialGradient(m - 22, m - 24, 8, m, m, 92);
  d.addColorStop(0, "#fffdf3"); d.addColorStop(0.7, "#e4e8f6"); d.addColorStop(1, "#aab4d4");
  g.fillStyle = d; g.beginPath(); g.arc(m, m, 88, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(m, m, 88, 0, 7); g.clip();
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(110,125,170,${0.1 + R() * 0.16})`; g.beginPath(); g.ellipse(m + (R() - 0.5) * 150, m + (R() - 0.5) * 150, 6 + R() * 18, 5 + R() * 14, 0, 0, 7); g.fill(); }
  const sh = g.createRadialGradient(m + 40, m + 30, 30, m + 40, m + 30, 130); sh.addColorStop(0, "rgba(40,50,100,0)"); sh.addColorStop(1, "rgba(30,40,90,.45)"); g.fillStyle = sh; g.fillRect(0, 0, S, S);
  g.restore();
  return c;
}

let BW = 1e9;
function branch(g, x, y, ang, len, w, depth, R) {
  if (depth <= 0 || w < 0.5) return;
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  if (x2 > BW || x2 < -60 || y2 < -30) return;
  g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
  g.quadraticCurveTo((x + x2) / 2 + (R() - 0.5) * len * 0.5, (y + y2) / 2 + (R() - 0.5) * len * 0.5, x2, y2); g.stroke();
  const n = depth > 2 ? 2 + (R() < 0.35 ? 1 : 0) : 2;
  for (let i = 0; i < n; i++) branch(g, x2, y2, ang + (R() - 0.5) * 1.55 - (i === 0 ? 0.1 : 0), len * (0.66 + R() * 0.14), w * 0.66, depth - 1, R);
}

/** Far ridge with dead trees and a chapel with a lit window; baseline = bottom edge. */
export function bakeFar(W) {
  BW = 1e9;
  const w = Math.round(W * 1.5), h = 330, c = cv(w, h), g = c.getContext("2d"), R = rng(21);
  const ridge = (col, amp, base, ph) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) g.lineTo(x, base - amp * (0.55 * Math.sin(x * 0.004 + ph) + 0.3 * Math.sin(x * 0.011 + ph * 2) + 0.15 * Math.sin(x * 0.03)));
    g.lineTo(w, h); g.closePath(); g.fill();
  };
  ridge("#171024", 70, h - 90, 1);
  g.strokeStyle = "#171024"; g.lineCap = "round";
  for (let i = 0; i < 9; i++) { const x = (i + R() * 0.8) * (w / 9); branch(g, x, h - 90, -Math.PI / 2 + (R() - 0.5) * 0.3, 40 + R() * 40, 5 + R() * 3, 6, R); }
  // chapel
  const cx = w * 0.7, by = h - 100;
  g.fillStyle = "#120c1c"; g.fillRect(cx - 40, by - 46, 80, 50); g.beginPath(); g.moveTo(cx - 48, by - 46); g.lineTo(cx, by - 86); g.lineTo(cx + 48, by - 46); g.fill();
  g.fillRect(cx + 40, by - 100, 22, 104); g.beginPath(); g.moveTo(cx + 36, by - 100); g.lineTo(cx + 51, by - 140); g.lineTo(cx + 66, by - 100); g.fill();
  g.fillStyle = "#ffae42"; g.shadowColor = "#ff8a00"; g.shadowBlur = 14; g.fillRect(cx - 8, by - 32, 10, 18); g.fillRect(cx + 46, by - 82, 6, 12); g.shadowBlur = 0;
  ridge("#0d0916", 50, h - 40, 3);
  for (let i = 0; i < 12; i++) { const x = R() * w; g.strokeStyle = "#0d0916"; branch(g, x, h - 44, -Math.PI / 2 + (R() - 0.5) * 0.4, 26 + R() * 30, 3.5 + R() * 2, 5, R); }
  const f = g.createLinearGradient(0, h - 130, 0, h); f.addColorStop(0, "rgba(70,40,90,0)"); f.addColorStop(1, "rgba(70,40,90,.5)");
  g.fillStyle = f; g.fillRect(0, h - 130, w, 130);
  return c;
}

/** The cemetery gate with the ChiSetup sign. 520x360 logical, baked at 2x, baseline = bottom. */
export function bakeGate() {
  const K = 2, c = cv(520 * K, 360 * K), g = c.getContext("2d"), R = rng(33);
  g.scale(K, K);
  const stone = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, "#4b5272"); gr.addColorStop(0.5, "#2d3148"); gr.addColorStop(1, "#171a2a");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1.2;
    for (let yy = y + 22, r = 0; yy < y + h; yy += 22, r++) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); for (let xx = x + (r % 2 ? 14 : 36); xx < x + w; xx += 44) { g.beginPath(); g.moveTo(xx, yy - 22); g.lineTo(xx, yy); g.stroke(); } }
  };
  // iron leaves
  g.strokeStyle = "#0b0a12"; g.lineWidth = 5;
  for (let x = 84; x <= 436; x += 20) { g.beginPath(); g.moveTo(x, 360); g.lineTo(x, 150 + Math.abs(x - 260) * 0.12); g.stroke(); g.fillStyle = "#0b0a12"; const y0 = 150 + Math.abs(x - 260) * 0.12; g.beginPath(); g.moveTo(x - 6, y0 + 2); g.lineTo(x, y0 - 18); g.lineTo(x + 6, y0 + 2); g.fill(); }
  g.lineWidth = 7; for (const y of [210, 320]) { g.beginPath(); g.moveTo(70, y); g.lineTo(450, y); g.stroke(); }
  g.lineWidth = 6; g.beginPath(); g.moveTo(70, 160); g.bezierCurveTo(100, 40, 200, 48, 260, 42); g.bezierCurveTo(320, 48, 420, 40, 450, 160); g.stroke();
  g.lineWidth = 3; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(260 + s * (60 + i * 54), 92 + i * 4, 16, 0, Math.PI * 1.6); g.stroke(); }
  stone(0, 100, 72, 260); stone(448, 100, 72, 260);
  for (const x of [-6, 442]) { const gr = g.createLinearGradient(x, 0, x + 84, 0); gr.addColorStop(0, "#5a6285"); gr.addColorStop(1, "#1d2133"); g.fillStyle = gr; g.fillRect(x, 84, 84, 22); }
  for (const x of [36, 484]) { // pumpkin lanterns on pillars
    const rg = g.createRadialGradient(x, 64, 2, x, 64, 56); rg.addColorStop(0, "rgba(255,160,40,.9)"); rg.addColorStop(1, "rgba(255,102,0,0)"); g.fillStyle = rg; g.fillRect(x - 56, 8, 112, 112);
    g.fillStyle = "#ff7a12"; g.beginPath(); g.ellipse(x, 66, 26, 22, 0, 0, 7); g.fill(); g.fillStyle = "#ffeb8a";
    g.beginPath(); g.moveTo(x - 14, 60); g.lineTo(x - 5, 60); g.lineTo(x - 10, 51); g.fill(); g.beginPath(); g.moveTo(x + 5, 60); g.lineTo(x + 14, 60); g.lineTo(x + 10, 51); g.fill();
    g.beginPath(); g.moveTo(x - 14, 72); g.lineTo(x - 6, 78); g.lineTo(x, 72); g.lineTo(x + 6, 78); g.lineTo(x + 14, 72); g.lineTo(x + 10, 80); g.lineTo(x - 10, 80); g.fill();
    g.fillStyle = "#4b3a1a"; g.fillRect(x - 3, 40, 6, 8);
  }
  // sign on chains
  g.strokeStyle = "#1b1b26"; g.lineWidth = 3; g.setLineDash([5, 3]); for (const x of [190, 330]) { g.beginPath(); g.moveTo(x, 42 + (Math.abs(x - 260) > 0 ? 6 : 0)); g.lineTo(x, 86); g.stroke(); } g.setLineDash([]);
  const pg = g.createLinearGradient(0, 84, 0, 146); pg.addColorStop(0, "#4a2d19"); pg.addColorStop(1, "#2a190d");
  g.fillStyle = pg; g.beginPath(); g.roundRect(150, 84, 220, 62, 8); g.fill();
  g.strokeStyle = "#ff6600"; g.lineWidth = 2.5; g.beginPath(); g.roundRect(155, 89, 210, 52, 5); g.stroke();
  g.fillStyle = "#c9b27a"; for (const [x, y] of [[160, 94], [360, 94], [160, 136], [360, 136]]) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
  g.save(); g.font = '800 40px "Exo 2", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "#ff6600"; g.shadowBlur = 16; g.fillStyle = "#ffd9b0"; g.fillText("Chi", 216, 117); g.fillStyle = "#ff6600"; g.fillText("Setup", 307, 117);
  g.shadowBlur = 0; g.restore();
  // cobweb corner
  g.strokeStyle = "rgba(220,225,255,.28)"; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 5) * Math.PI / 2; g.moveTo(72, 108); g.lineTo(72 + Math.cos(a) * 60, 108 + Math.sin(a) * 60); }
  for (let r = 14; r <= 56; r += 14) g.arc(72, 108, r, 0, Math.PI / 2); g.stroke();
  return c;
}

export function bakeTree(seed, flip) {
  const w = 760, h = 1080, c = cv(w, h), g = c.getContext("2d"), R = rng(seed); BW = w - 14;
  g.fillStyle = g.strokeStyle = "#050409"; g.lineCap = "round"; g.lineJoin = "round";
  // trunk
  g.beginPath(); g.moveTo(-40, h); g.bezierCurveTo(40, h - 300, -20, h - 600, 70, h - 820);
  g.lineTo(130, h - 800); g.bezierCurveTo(60, h - 560, 120, h - 300, 120, h); g.closePath(); g.fill();
  const tips = [[100, h - 800, -1.3], [90, h - 700, -0.3], [75, h - 620, -2.1], [110, h - 520, -0.1]];
  for (const [x, y, a] of tips) branch(g, x, y, a + (R() - 0.5) * 0.3, 150 + R() * 70, 22 + R() * 6, 7, R);
  g.strokeStyle = "rgba(50,40,70,.9)"; g.lineWidth = 2; // moonlit rim
  g.beginPath(); g.moveTo(-40, h); g.bezierCurveTo(40, h - 300, -20, h - 600, 70, h - 820); g.stroke();
  g.strokeStyle = "#050409"; g.lineWidth = 2; // hanging vines
  for (let i = 0; i < 5; i++) { const x = 140 + R() * 300, y = 60 + R() * 300, l = 80 + R() * 160; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * 30, y + l / 2, x + (R() - 0.5) * 20, y + l); g.stroke(); }
  if (flip) { const f = cv(w, h), fg = f.getContext("2d"); fg.translate(w, 0); fg.scale(-1, 1); fg.drawImage(c, 0, 0); return f; }
  return c;
}

export function bakeLantern() {
  const c = cv(40, 64), g = c.getContext("2d");
  g.strokeStyle = "#0b0a10"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(20, 0); g.lineTo(20, 10); g.stroke();
  g.fillStyle = "#0b0a10"; g.fillRect(8, 8, 24, 6); g.fillRect(8, 52, 24, 6);
  g.fillStyle = "#ffb44a"; g.fillRect(11, 14, 18, 38);
  g.fillStyle = "#fff0b8"; g.fillRect(16, 20, 8, 26);
  g.strokeStyle = "#0b0a10"; g.lineWidth = 2.5; g.strokeRect(11, 14, 18, 38); g.beginPath(); g.moveTo(20, 14); g.lineTo(20, 52); g.stroke();
  return c;
}
