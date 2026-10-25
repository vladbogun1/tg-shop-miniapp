// «Котёл ведьмы» — визуал розыгрыша. Один canvas 2D, дизайн-сетка 1920×1080 (вписывается в любой размер).
// До ролла души-огоньки кружат вокруг котла, в ролл их засасывает воронка, котёл трясётся, «пшик»,
// и из котла вылетает душа победителя, которую задал хост. Всё в этом файле, без внешних библиотек.

export const meta = { id: "cauldron", title: "Котёл ведьмы", author: "agent" };

// ---------------------------------------------------------------- константы и утилиты
const W = 1920, H = 1080;
const PX = 960, PY = 770;            // центр обода котла (он же «устье», куда падают души)
const CY = 560;                      // центр орбит
const WX = 960, WY = 350;            // где раскрывается портрет победителя
const TAU = Math.PI * 2;
const SPR = (n) => new URL(`../../assets/sprites/${n}.png`, import.meta.url).href;

const COLS = {
  orange: { rgb: [255, 122, 26], css: "#ff6600", disc: ["#ffb866", "#8a2f00"] },
  green: { rgb: [124, 255, 79], css: "#7cff4f", disc: ["#c4ffa8", "#1d6a0a"] },
  violet: { rgb: [170, 105, 255], css: "#8a3ffc", disc: ["#d3b1ff", "#3d1280"] },
  pale: { rgb: [225, 255, 230], css: "#e6ffe9", disc: ["#ffffff", "#7a8a7a"] },
};
const COLNAMES = Object.keys(COLS);

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeBack = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const frac = (x) => x - Math.floor(x);

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
function mk(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function glowSprite(rgb, size = 64) {
  const c = mk(size, size), g = c.getContext("2d"), h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.12, rgba(mixRgb(rgb, [255, 255, 255], 0.45), 0.95));
  gr.addColorStop(0.35, rgba(rgb, 0.42));
  gr.addColorStop(0.7, rgba(rgb, 0.1));
  gr.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
function blobSprite(size = 128) {
  const c = mk(size, size), g = c.getContext("2d"), h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, "rgba(255,255,255,0.55)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.2)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }

// ---------------------------------------------------------------- mount
export function mount(root, host) {
  const Q = 1.5; // суперсэмплинг кэшей текста/бейджей

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;background:#0e0e10";
  root.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });

  let destroyed = false, raf = 0, last = performance.now(), T = 0;
  let cw = 0, ch = 0, fit = 1, ox = 0, oy = 0, res = 1;
  const reduced = !!host.reducedMotion;
  const avatarsOn = host.privacy?.avatars !== false;
  const snd = (n) => { try { host.sound?.(n); } catch { /* sound is optional */ } };

  // ---- спрайты
  const glow = {}; for (const k of COLNAMES) glow[k] = glowSprite(COLS[k].rgb, 64);
  const blob = blobSprite(128);
  const blobTint = {
    smoke: tintBlob([170, 230, 180]), violet: tintBlob([150, 110, 220]), warm: tintBlob([255, 150, 70]),
  };
  function tintBlob(rgb) {
    const c = mk(128, 128), x = c.getContext("2d");
    x.drawImage(blob, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = rgba(rgb, 1); x.fillRect(0, 0, 128, 128);
    return c;
  }
  const hero = { wave: new Image(), blink: new Image() };
  hero.wave.src = SPR("hero_wave"); hero.blink.src = SPR("hero_blink");

  // ---- тексты
  const spriteCache = new Map();
  const tctx = mk(8, 8).getContext("2d");
  function textSprite(text, o) {
    const key = text + "|" + o.font + "|" + o.fill + "|" + (o.glow || "") + "|" + (o.bg || "") + "|" + (o.ls || "") + "|" + (o.sw || "");
    let sp = spriteCache.get(key);
    if (sp) return sp;
    if (spriteCache.size > 400) spriteCache.clear();
    tctx.font = o.font; tctx.letterSpacing = o.ls || "0px";
    const tw = Math.ceil(tctx.measureText(text).width);
    const size = o.size, pad = o.pad ?? 26, bx = o.bg ? 14 : 0, by = o.bg ? 5 : 0;
    const w = tw + 2 * pad + 2 * bx, h = Math.ceil(size * 1.35) + 2 * pad + 2 * by;
    const c = mk(w * Q, h * Q), x = c.getContext("2d");
    x.scale(Q, Q);
    x.font = o.font; x.letterSpacing = o.ls || "0px"; x.textBaseline = "middle"; x.textAlign = "left"; x.lineJoin = "round";
    const cx = pad + bx, cy = h / 2 + size * 0.04;
    if (o.bg) {
      x.fillStyle = o.bg; x.beginPath();
      x.roundRect(pad, h / 2 - size * 0.68 - by + 0, tw + 2 * bx, size * 1.36 + 2 * by - 0, (size * 1.36 + 2 * by) / 2); x.fill();
    }
    if (o.glow) { x.shadowColor = o.glow; x.shadowBlur = o.blur ?? 20; x.fillStyle = o.fill; x.fillText(text, cx, cy); x.fillText(text, cx, cy); x.shadowBlur = 0; }
    if (o.sw) { x.lineWidth = o.sw; x.strokeStyle = o.stroke || "rgba(0,0,0,.8)"; x.strokeText(text, cx, cy); }
    x.fillStyle = o.fill; x.fillText(text, cx, cy);
    sp = { c, w, h, tw };
    spriteCache.set(key, sp);
    return sp;
  }
  function drawSprite(sp, cx, cy, sc = 1, a = 1) {
    if (a <= 0.003) return;
    g.globalAlpha = a;
    g.drawImage(sp.c, cx - (sp.w * sc) / 2, cy - (sp.h * sc) / 2, sp.w * sc, sp.h * sc);
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
  function drawDisc(x, cx, cy, r, name, colName, img) {
    const cs = COLS[colName];
    const gr = x.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    gr.addColorStop(0, cs.disc[0]); gr.addColorStop(1, cs.disc[1]);
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = gr; x.fill();
    if (img) {
      x.save(); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.clip();
      const s = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
      x.drawImage(img, cx - (img.naturalWidth * s) / 2, cy - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      x.restore();
    } else {
      const ch0 = (Array.from(name.trim())[0] || "?").toUpperCase();
      x.font = `800 ${Math.round(r * 1.1)}px "Exo 2", sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
      x.shadowColor = "rgba(0,0,0,.55)"; x.shadowBlur = r * 0.2; x.fillStyle = "#fff";
      x.fillText(ch0, cx, cy + r * 0.06); x.shadowBlur = 0;
      // блик
      x.beginPath(); x.ellipse(cx - r * 0.32, cy - r * 0.5, r * 0.4, r * 0.18, -0.5, 0, TAU); x.fillStyle = "rgba(255,255,255,.22)"; x.fill();
    }
  }

  // ---------------------------------------------------------------- статика: фон и котёл
  let bgC = null, potBackC = null, potFrontC = null, faceC = null, rayC = null;
  const POT = { x0: PX - 400, y0: PY - 150, w: 800, h: 480 };

  function buildStatic() {
    res = Math.max(1, fit);
    // фон
    bgC = mk(W * res, H * res);
    let x = bgC.getContext("2d"); x.scale(res, res);
    const rnd = mulberry(7);
    x.fillStyle = "#0e0e10"; x.fillRect(0, 0, W, H);
    let gr = x.createRadialGradient(PX, 900, 0, PX, 900, 1000);
    gr.addColorStop(0, "rgba(70,22,120,.42)"); gr.addColorStop(0.5, "rgba(40,14,70,.2)"); gr.addColorStop(1, "rgba(14,14,16,0)");
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    gr = x.createRadialGradient(PX, 540, 0, PX, 540, 760);
    gr.addColorStop(0, "rgba(20,70,28,.22)"); gr.addColorStop(1, "rgba(14,14,16,0)");
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // звёзды
    for (let i = 0; i < 150; i++) {
      const sx = rnd() * W, sy = rnd() * 640, sr = 0.5 + rnd() * 1.3;
      x.fillStyle = `rgba(220,230,255,${0.12 + rnd() * 0.5})`; x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fill();
    }
    // луна
    const mx = 1570, my = 270;
    gr = x.createRadialGradient(mx, my, 40, mx, my, 420);
    gr.addColorStop(0, "rgba(200,215,255,.22)"); gr.addColorStop(1, "rgba(200,215,255,0)");
    x.fillStyle = gr; x.fillRect(mx - 430, my - 430, 860, 860);
    gr = x.createRadialGradient(mx - 20, my - 20, 5, mx, my, 70);
    gr.addColorStop(0, "#fffbe8"); gr.addColorStop(1, "#c9c7b0");
    x.fillStyle = gr; x.beginPath(); x.arc(mx, my, 66, 0, TAU); x.fill();
    x.fillStyle = "rgba(120,120,100,.22)";
    for (const [dx, dy, r] of [[-22, -12, 13], [20, 14, 17], [-6, 30, 8], [28, -26, 8], [-30, 18, 6]]) { x.beginPath(); x.arc(mx + dx, my + dy, r, 0, TAU); x.fill(); }
    // силуэты: холмы, надгробия, мёртвые деревья
    x.fillStyle = "#08080b";
    x.beginPath(); x.moveTo(0, H); x.lineTo(0, 950);
    for (let i = 0; i <= 24; i++) x.lineTo((i / 24) * W, 960 + Math.sin(i * 0.9) * 18 + Math.sin(i * 2.3) * 8);
    x.lineTo(W, H); x.closePath(); x.fill();
    const stones = [[110, 0], [230, 1], [380, 0], [1500, 1], [1660, 0], [1810, 1], [60, 1], [1740, 0]];
    for (const [sx, k] of stones) {
      const sy = 975 + (k ? 6 : 0), sw = 46 + (k ? 8 : 0), sh = 80 - k * 18;
      x.beginPath(); x.moveTo(sx - sw / 2, sy + 20); x.lineTo(sx - sw / 2, sy - sh + sw / 2);
      x.arc(sx, sy - sh + sw / 2, sw / 2, Math.PI, 0); x.lineTo(sx + sw / 2, sy + 20); x.closePath(); x.fill();
      if (!k) { x.fillStyle = "#12121a"; x.fillRect(sx - 2, sy - sh + 14, 4, 26); x.fillRect(sx - 11, sy - sh + 22, 22, 4); x.fillStyle = "#08080b"; }
    }
    const tree = (bx, by, len, ang, depth) => {
      if (depth === 0 || len < 8) return;
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      x.strokeStyle = "#07070a"; x.lineWidth = Math.max(1.5, depth * 2.2); x.lineCap = "round";
      x.beginPath(); x.moveTo(bx, by); x.lineTo(ex, ey); x.stroke();
      tree(ex, ey, len * (0.72 + rnd() * 0.1), ang - 0.2 - rnd() * 0.5, depth - 1);
      tree(ex, ey, len * (0.7 + rnd() * 0.1), ang + 0.2 + rnd() * 0.5, depth - 1);
    };
    tree(60, 1000, 130, -Math.PI / 2 - 0.1, 7); tree(1860, 1000, 150, -Math.PI / 2 + 0.12, 7);
    // виньетка
    gr = x.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 1180);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.62)");
    x.fillStyle = gr; x.fillRect(0, 0, W, H);

    // котёл: задняя часть (ручки, ножки, обод, нутро)
    potBackC = mk(POT.w * res, POT.h * res); x = potBackC.getContext("2d"); x.scale(res, res); x.translate(-POT.x0, -POT.y0);
    // ручки
    x.lineWidth = 15; x.strokeStyle = "#1b1a21";
    for (const sx of [-1, 1]) { ell(x, PX + sx * 322, PY + 62, 34, 46); x.stroke(); }
    x.lineWidth = 3; x.strokeStyle = "rgba(255,255,255,.12)";
    for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(PX + sx * 322, PY + 62, 40, 52, 0, Math.PI * 1.1, Math.PI * 1.7); x.stroke(); }
    // ножки
    x.fillStyle = "#0c0c10";
    for (const lx of [-175, 0, 175]) {
      x.beginPath(); x.moveTo(PX + lx - 38, PY + 250); x.lineTo(PX + lx + 38, PY + 250); x.lineTo(PX + lx + 26, PY + 308); x.lineTo(PX + lx - 26, PY + 308); x.closePath(); x.fill();
    }
    // обод
    gr = x.createLinearGradient(0, PY - 62, 0, PY + 62);
    gr.addColorStop(0, "#555261"); gr.addColorStop(0.5, "#24232b"); gr.addColorStop(1, "#121116");
    ell(x, PX, PY, 272, 63); x.fillStyle = gr; x.fill();
    x.beginPath(); x.ellipse(PX, PY, 272, 63, 0, Math.PI, TAU); x.strokeStyle = "rgba(255,255,255,.25)"; x.lineWidth = 3; x.stroke();
    // нутро
    gr = x.createLinearGradient(0, PY - 50, 0, PY + 50);
    gr.addColorStop(0, "#020203"); gr.addColorStop(1, "#0a0d0a");
    ell(x, PX, PY, 246, 51); x.fillStyle = gr; x.fill();

    // котёл: передняя часть (корпус, передняя половина обода)
    potFrontC = mk(POT.w * res, POT.h * res); x = potFrontC.getContext("2d"); x.scale(res, res); x.translate(-POT.x0, -POT.y0);
    const body = () => {
      x.beginPath(); x.moveTo(PX - 270, PY);
      x.bezierCurveTo(PX - 350, PY + 90, PX - 335, PY + 232, PX - 150, PY + 282);
      x.quadraticCurveTo(PX, PY + 300, PX + 150, PY + 282);
      x.bezierCurveTo(PX + 335, PY + 232, PX + 350, PY + 90, PX + 270, PY);
      x.ellipse(PX, PY, 270, 62, 0, 0, Math.PI, false); x.closePath();
    };
    body();
    gr = x.createLinearGradient(PX - 340, 0, PX + 340, 0);
    gr.addColorStop(0, "#06060a"); gr.addColorStop(0.16, "#1b1a22"); gr.addColorStop(0.34, "#3a3843"); gr.addColorStop(0.5, "#1f1e26");
    gr.addColorStop(0.72, "#121217"); gr.addColorStop(1, "#040406");
    x.fillStyle = gr; x.fill();
    x.save(); body(); x.clip();
    gr = x.createLinearGradient(0, PY, 0, PY + 300);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.62)");
    x.fillStyle = gr; x.fillRect(PX - 360, PY, 720, 310);
    // железные пояса и заклёпки
    for (const by of [PY + 78, PY + 222]) {
      x.strokeStyle = "rgba(0,0,0,.55)"; x.lineWidth = 9;
      x.beginPath(); x.ellipse(PX, by - 70, 340, 70, 0, 0.05, Math.PI - 0.05); x.stroke();
      x.strokeStyle = "rgba(255,255,255,.09)"; x.lineWidth = 2;
      x.beginPath(); x.ellipse(PX, by - 74, 340, 70, 0, 0.05, Math.PI - 0.05); x.stroke();
    }
    x.fillStyle = "rgba(255,255,255,.12)";
    for (let i = -7; i <= 7; i++) {
      const a = Math.PI / 2 + i * 0.12, rx = 300, ry = 62;
      x.beginPath(); x.arc(PX + Math.cos(a) * rx * 1.03, PY + 8 + Math.sin(a) * ry, 3.4, 0, TAU); x.fill();
    }
    x.restore();
    // передняя половина обода
    gr = x.createLinearGradient(0, PY, 0, PY + 64);
    gr.addColorStop(0, "#35333d"); gr.addColorStop(1, "#0f0f13");
    x.beginPath(); x.ellipse(PX, PY, 272, 63, 0, 0, Math.PI, false); x.ellipse(PX, PY, 246, 51, 0, Math.PI, 0, true); x.closePath();
    x.fillStyle = gr; x.fill();
    x.beginPath(); x.ellipse(PX, PY, 246, 51, 0, 0, Math.PI, false); x.strokeStyle = "rgba(124,255,79,.28)"; x.lineWidth = 2.5; x.stroke();
    x.beginPath(); x.ellipse(PX, PY, 272, 63, 0, 0.15, Math.PI - 0.15, false); x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 2; x.stroke();

    // резное лицо тыквы (светится изнутри)
    faceC = mk(320 * Q, 190 * Q); x = faceC.getContext("2d"); x.scale(Q, Q);
    const face = (blur, col) => {
      x.shadowColor = "#ff6600"; x.shadowBlur = blur; x.fillStyle = col;
      x.beginPath(); x.moveTo(62, 30); x.lineTo(112, 30); x.lineTo(90, 78); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(208, 30); x.lineTo(258, 30); x.lineTo(230, 78); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(160, 84); x.lineTo(146, 108); x.lineTo(174, 108); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(52, 118); x.lineTo(84, 126); x.lineTo(104, 156); x.lineTo(130, 128); x.lineTo(160, 160); x.lineTo(190, 128);
      x.lineTo(216, 156); x.lineTo(236, 126); x.lineTo(268, 118); x.lineTo(250, 144); x.lineTo(222, 176); x.lineTo(190, 150);
      x.lineTo(160, 178); x.lineTo(130, 150); x.lineTo(98, 176); x.lineTo(70, 144); x.closePath(); x.fill();
    };
    face(34, "rgba(255,102,0,.9)"); face(10, "#ffb35a");

    // лучи для победителя
    rayC = mk(1200, 1200); x = rayC.getContext("2d"); x.translate(600, 600);
    for (let i = 0; i < 16; i++) {
      x.save(); x.rotate((i / 16) * TAU);
      const lg = x.createLinearGradient(0, 0, 600, 0);
      lg.addColorStop(0, "rgba(255,200,120,.5)"); lg.addColorStop(1, "rgba(255,120,30,0)");
      x.fillStyle = lg; x.beginPath(); x.moveTo(0, 0); x.lineTo(600, -34 - (i % 2) * 18); x.lineTo(600, 34 + (i % 2) * 18); x.closePath(); x.fill();
      x.restore();
    }
  }

  function resize() {
    const r = root.getBoundingClientRect();
    const cssW = Math.max(320, r.width || host.size?.w || innerWidth), cssH = Math.max(180, r.height || host.size?.h || innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = Math.round(cssW * dpr), nh = Math.round(cssH * dpr);
    fit = Math.min(nw / W, nh / H);
    if (nw !== cw || nh !== ch) { cw = nw; ch = nh; canvas.width = nw; canvas.height = nh; }
    ox = (nw - W * fit) / 2; oy = (nh - H * fit) / 2;
    buildStatic();
  }

  // ---------------------------------------------------------------- души
  const souls = [];
  const byId = new Map();
  let phase = "idle";          // idle | roll | win
  let speedMul = 1, boil = 0.35, boilTarget = 0.35, gulp = 0, shakeAmp = 0, flash = 0, faceI = 0.3;
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
    s.glowK = s.labeled ? 3.8 : 5.4;
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
  function ensureBadge(s) {
    if (s.badge) return;
    const d = Math.ceil((s.r + 7) * 2), c = mk(d * Q, d * Q), x = c.getContext("2d");
    x.scale(Q, Q);
    const cx = d / 2, cy = d / 2;
    const img = getImg(s.p.avatar, () => { s.badge = null; });
    x.beginPath(); x.arc(cx, cy, s.r + 3, 0, TAU); x.fillStyle = "rgba(8,8,12,.85)"; x.fill();
    drawDisc(x, cx, cy, s.r, s.p.name, s.col, img);
    x.beginPath(); x.arc(cx, cy, s.r + 1.5, 0, TAU); x.strokeStyle = COLS[s.col].css; x.lineWidth = 3; x.stroke();
    s.badge = { c, d };
  }
  function ensureLabel(s) {
    if (s.label) return;
    const fs = Math.round(20 * Math.min(1.5, sizing().boost * 0.95));
    s.label = textSprite(s.p.name, { font: `600 ${fs}px "Exo 2", sans-serif`, fill: "#f6f3ec", bg: "rgba(10,10,14,.62)", size: fs, pad: 6 });
  }

  function setParticipants(list) {
    const pool = (list || []).filter((p) => !p.won);
    const ids = new Set();
    let added = 0;
    for (const p of pool) {
      ids.add(p.id);
      let s = byId.get(p.id);
      if (!s) {
        s = makeSoul(p); byId.set(p.id, s); souls.push(s); added++;
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
    sparks.push({ x, y, vx, vy, life, max: life, size, col, g: o.g ?? 0, drag: o.drag ?? 0, rect: o.rect || 0, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
  }
  function puff(x, y, vx, vy, r, life, kind = "smoke", a = 0.2) {
    if (puffs.length > 160) return;
    puffs.push({ x, y, vx, vy, r, gr: r * 0.9, life, max: life, kind, a });
  }
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
    [0, 1.8, "Зілля закипає…"], [1.8, 5.6, "Душі злітаються до котла…"], [5.6, 6.3, "Тиша…"],
    [6.3, 7.4, "Котел здригається…"], [7.4, 8.7, "Щось піднімається…"], [8.7, 9.9, "Хибна тривога!"],
    [9.9, 11.3, "Хто ж вилетить?!"],
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
    faceI = clamp(0.25 + bt * 0.9);
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
    const head = textSprite("ПЕРЕМОЖЕЦЬ", { font: '800 70px "Exo 2", sans-serif', fill: "#7cff4f", glow: "#3fd11b", blur: 26, size: 70, ls: "6px", sw: 8, stroke: "rgba(8,20,6,.9)", pad: 34 });
    const rnd = textSprite(`Раунд ${info.round} з ${info.totalRounds}`, { font: '700 44px "Exo 2", sans-serif', fill: "#ff8a2a", glow: "#ff6600", blur: 18, size: 44, ls: "3px", sw: 6, stroke: "rgba(30,10,0,.9)", pad: 28 });
    let fs = 118;
    tctx.font = `800 ${fs}px "Exo 2", sans-serif`;
    while (tctx.measureText(w.name).width > 1300 && fs > 48) { fs -= 4; tctx.font = `800 ${fs}px "Exo 2", sans-serif`; }
    const name = textSprite(w.name, { font: `800 ${fs}px "Exo 2", sans-serif`, fill: "#ffffff", glow: "#ff6600", blur: 34, size: fs, sw: 12, stroke: "rgba(20,6,0,.92)", pad: 44 });
    const sub = [];
    if (w.handle) sub.push(w.handle);
    sub.push(`Квитки: ${w.tickets}`);
    const subS = textSprite(sub.join("   ·   "), { font: '600 42px "Exo 2", sans-serif', fill: "#d9ffc9", glow: "#3fd11b", blur: 12, size: 42, sw: 6, stroke: "rgba(4,14,2,.9)", pad: 24 });
    return { head, rnd, name, subS, col: colorFor(w) };
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
    phase = "idle"; speedMul = 1; boilTarget = 0.35; shakeAmp = 0; faceI = 0.3;
    souls.forEach((s) => { if (s.mode === "in" || s.mode === "suck") { s.mode = "out"; s.wait = s.rnd() * 0.7; s.dur = 1.0 + s.rnd() * 0.3; } });
    rebuildLabels();
    total = souls.length; totalTickets = souls.reduce((a, s) => a + s.tk, 0);
    root.dataset.winner = "";
  }

  // ---------------------------------------------------------------- рисование
  const passList = [[], [], []];
  const embers = Array.from({ length: 110 }, (_, i) => ({ ph: Math.random(), a0: Math.random() * TAU, rate: 0.045 + Math.random() * 0.05, col: COLNAMES[i % 3], sz: 3 + Math.random() * 4, dir: Math.random() < 0.5 ? 1 : -1 }));
  const flies = Array.from({ length: 48 }, () => ({ x: Math.random() * W, y: 160 + Math.random() * 760, ph: Math.random() * TAU, sp: 0.2 + Math.random() * 0.5, col: COLNAMES[(Math.random() * 3) | 0] }));
  const bats = Array.from({ length: 3 }, (_, i) => ({ x: -200 - i * 700, y: 150 + i * 90, v: 95 + i * 25, ph: i * 2 }));
  const mists = Array.from({ length: 6 }, (_, i) => ({ x: i * 380, y: 930 + (i % 3) * 30, r: 360, v: 14 + i * 3 }));

  function drawSoulsPass(pass) {
    const list = passList[pass];
    // пыль: аддитивно
    g.globalCompositeOperation = "lighter";
    for (const s of list) {
      if (s.labeled) continue;
      const a = s.alpha * (0.72 + 0.28 * Math.sin(T * 2.6 + s.ph));
      if (a <= 0.01) continue;
      const sz = s.r * s.glowK * s.sc;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(glow[s.col], s.x - sz / 2, s.y - sz / 2, sz, sz);
      if (s.trail && s.k > 0 && s.k < 1 && s.mode !== "orbit" && s.wait <= 0) {
        // хвост воронки
        const tx = s.x - Math.sin(s.ang) * 26 * (1 - s.e) * 0 - (s.x - PX) * 0.13, ty = s.y - (s.y - PY) * 0.1 - 6;
        g.globalAlpha = a * 0.5; g.drawImage(glow[s.col], tx - sz / 3, ty - sz / 3, sz * 0.66, sz * 0.66);
      }
    }
    g.globalAlpha = 1;
    // именные души
    for (const s of list) {
      if (!s.labeled) continue;
      const a = s.alpha; if (a <= 0.01) continue;
      const pulse = 0.85 + 0.15 * Math.sin(T * 2.2 + s.ph);
      const gs = s.r * s.glowK * s.sc * pulse;
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = Math.min(1, a * 0.95);
      g.drawImage(glow[s.col], s.x - gs / 2, s.y - gs / 2, gs, gs);
      g.globalCompositeOperation = "source-over";
      ensureBadge(s);
      const d = s.badge.d * s.sc;
      g.globalAlpha = Math.min(1, a * 1.15);
      g.drawImage(s.badge.c, s.x - d / 2, s.y - d / 2, d, d);
      if (s.e < 0.35) {
        ensureLabel(s);
        const la = a * (1 - s.e / 0.35) * (0.5 + 0.5 * (s.z + 1) / 2);
        drawSprite(s.label, s.x, s.y + (s.r + 20) * s.sc, s.sc * 0.98, la);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  function drawLiquid(bl) {
    const cx = PX, cy = PY + 3, rx = 240, ry = 48;
    g.save();
    ell(g, cx, cy, rx, ry); g.clip();
    const c1 = mixRgb([22, 60, 34], [124, 255, 79], bl), c0 = mixRgb([10, 36, 20], [60, 190, 50], bl);
    const gr = g.createRadialGradient(cx, cy - 8, 6, cx, cy, rx);
    gr.addColorStop(0, rgba(mixRgb(c1, [255, 255, 255], 0.25 * bl), 1)); gr.addColorStop(0.55, rgba(c1, 1)); gr.addColorStop(1, rgba(c0, 1));
    g.fillStyle = gr; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    // завихрения
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.rotate(T * (0.35 + bl * 1.3));
    g.lineWidth = 9; g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(215,255,195,${0.1 + 0.12 * bl})`;
      g.beginPath(); g.arc(0, 0, rx * (0.35 + i * 0.22), i * 2.1, i * 2.1 + 1.7); g.stroke();
    }
    g.restore();
    // пузыри
    for (const b of bubbles) {
      const p = b.age / b.life;
      if (p < 1) {
        const r = b.r * (0.5 + p * 0.5), bx = cx + b.u * rx * 0.9, by = cy + b.v * ry * 0.8 - p * 4;
        g.fillStyle = `rgba(190,255,160,${0.22 * (1 - p * 0.3)})`; g.strokeStyle = `rgba(235,255,225,${0.8 * (1 - p * 0.4)})`; g.lineWidth = 2;
        ell(g, bx, by, r, r * 0.46); g.fill(); g.stroke();
        g.fillStyle = "rgba(255,255,255,.7)"; ell(g, bx - r * 0.35, by - r * 0.12, r * 0.2, r * 0.1); g.fill();
      } else {
        const q = (b.age - b.life) / 0.25, r = b.r * (1 + q * 1.6);
        g.strokeStyle = `rgba(235,255,225,${0.7 * (1 - q)})`; g.lineWidth = 2.5;
        ell(g, cx + b.u * rx * 0.9, cy + b.v * ry * 0.8, r, r * 0.4); g.stroke();
      }
    }
    // блик поверхности
    const sg = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    sg.addColorStop(0, "rgba(255,255,255,.14)"); sg.addColorStop(0.5, "rgba(255,255,255,0)"); sg.addColorStop(1, "rgba(0,0,0,.35)");
    g.fillStyle = sg; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    g.restore();
    // сияние кромки
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(124,255,79,${0.18 + 0.4 * bl})`; g.lineWidth = 9; ell(g, cx, cy, rx + 2, ry + 1); g.stroke();
    g.strokeStyle = `rgba(210,255,190,${0.25 + 0.4 * bl})`; g.lineWidth = 2.5; ell(g, cx, cy, rx + 1, ry); g.stroke();
    g.globalCompositeOperation = "source-over";
  }

  function drawHat(x0, y0, s) {
    // пиксельная ведьмина шляпа в сетке спрайта волны (1 пиксель = s px)
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x0 + x * s), Math.round(y0 + y * s), Math.ceil(w * s), Math.ceil(h * s)); };
    const body = "#35186b", light = "#6a35c4", dark = "#1f0e45";
    for (let y = -17; y <= 3; y++) {
      const t = (y + 17) / 20;                        // 0 у кончика → 1 у основания
      let half = 2 + t * 12;
      let cxs = 38 + (y < -9 ? (-9 - y) * 0.55 : 0);   // кончик загнут вправо
      if (y < -12) cxs += (-12 - y) * 0.7;
      const xa = Math.round(cxs - half), xb = Math.round(cxs + half);
      px(xa, y, xb - xa, 1, body);
      px(xa, y, 2, 1, light); px(xb - 3, y, 3, 1, dark);
    }
    px(26, 0, 25, 3, "#ff6600"); px(26, 0, 25, 1, "#ff9a3d"); px(26, 2, 25, 1, "#b84400");
    px(36, -0.5, 5, 4, "#ffd54a"); px(37.5, 0.8, 2, 1.4, "#35186b");
    // поля
    px(15, 3, 46, 3, dark); px(17, 3, 42, 1, light); px(19, 5, 38, 2, "#150a30");
  }

  function drawHero() {
    const s = 5, ready = hero.blink.complete && hero.blink.naturalWidth;
    if (!ready) return;
    const waving = phase === "win" ? true : frac(T / 9) > 0.86;
    const sway = Math.sin(T * (1.6 + boil * 3)) * (1.5 + boil * 3);
    const x0 = 1566, y0 = 812 + sway;
    g.imageSmoothingEnabled = false;
    if (waving && hero.wave.naturalWidth) g.drawImage(hero.wave, x0, y0, hero.wave.naturalWidth * s, hero.wave.naturalHeight * s);
    else g.drawImage(hero.blink, x0 + 7 * s, y0, hero.blink.naturalWidth * s, hero.blink.naturalHeight * s);
    drawHat(x0, y0, s);
    g.imageSmoothingEnabled = true;
  }

  function drawBat(b) {
    const fl = Math.sin(T * 13 + b.ph), y = b.y + Math.sin(T * 1.7 + b.ph) * 26;
    g.save(); g.translate(b.x, y); g.scale(1.5, 1.5);
    g.fillStyle = "#150c28";
    g.beginPath(); g.ellipse(0, 0, 7, 5, 0, 0, TAU); g.fill();
    for (const sx of [-1, 1]) {
      g.beginPath(); g.moveTo(sx * 4, -2);
      g.quadraticCurveTo(sx * 18, -14 - fl * 10, sx * 34, -2 - fl * 12);
      g.quadraticCurveTo(sx * 26, 2, sx * 24, 8); g.quadraticCurveTo(sx * 16, 2, sx * 12, 8); g.quadraticCurveTo(sx * 8, 3, sx * 4, 5); g.closePath(); g.fill();
    }
    g.beginPath(); g.moveTo(-4, -4); g.lineTo(-3, -10); g.lineTo(0, -5); g.lineTo(3, -10); g.lineTo(4, -4); g.fill();
    g.restore();
  }

  function drawPortrait(cx, cy, R, w, col, open, a) {
    // ореол и кольцо
    g.globalCompositeOperation = "lighter";
    const gs = R * 5.2;
    g.globalAlpha = a * 0.95; g.drawImage(glow[col === "violet" ? "violet" : "orange"], cx - gs / 2, cy - gs / 2, gs, gs);
    g.globalAlpha = a * 0.5; g.drawImage(glow.green, cx - gs * 0.36, cy - gs * 0.36, gs * 0.72, gs * 0.72);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = a;
    const rr = R * open;
    g.beginPath(); g.arc(cx, cy, rr + 12, 0, TAU); g.fillStyle = "rgba(8,8,12,.9)"; g.fill();
    const img = getImg(w.avatar);
    drawDisc(g, cx, cy, rr, w.name, col, img);
    const rg = g.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
    rg.addColorStop(0, "#7cff4f"); rg.addColorStop(0.5, "#ff6600"); rg.addColorStop(1, "#8a3ffc");
    g.beginPath(); g.arc(cx, cy, rr + 6, 0, TAU); g.strokeStyle = rg; g.lineWidth = 12; g.stroke();
    g.globalAlpha = 1;
  }

  function drawWinner(wn, now) {
    const rt = T - wn.t0 + (T_REVEAL);   // время относительно начала ролла
    const age = T - wn.t0;
    const fadeA = wn.fade ? 1 - clamp((T - wn.fade) / 0.45) : 1;
    if (fadeA <= 0) { win = null; return; }
    const w = wn.w;
    // лучи
    g.globalCompositeOperation = "lighter";
    const rayA = smooth(age / 0.8) * fadeA * (reduced ? 0.5 : 0.85);
    g.save(); g.translate(WX, WY); g.rotate(T * 0.12); g.globalAlpha = rayA * 0.4;
    g.drawImage(rayC, -760, -760, 1520, 1520); g.restore();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    // кольца-ударные волны
    for (const [d0, c] of [[0, "255,138,42"], [0.18, "124,255,79"]]) {
      const q = (age - d0) / 1.1;
      if (q > 0 && q < 1) {
        g.strokeStyle = `rgba(${c},${0.7 * (1 - q) * fadeA})`; g.lineWidth = 10 * (1 - q) + 2;
        g.beginPath(); g.arc(WX, WY, 150 + 800 * easeOut(q), 0, TAU); g.stroke();
      }
    }
    // «души-спутники»
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 16; i++) {
      const a = T * (0.5 + (i % 3) * 0.1) + (i / 16) * TAU, r = 215 + (i % 2) * 38 + Math.sin(T * 1.2 + i) * 8;
      const x = WX + Math.cos(a) * r, y = WY + Math.sin(a) * r * 0.82, sz = (28 + (i % 4) * 7) * smooth(age / 1.2);
      g.globalAlpha = 0.85 * fadeA; g.drawImage(glow[COLNAMES[i % 3]], x - sz, y - sz, sz * 2, sz * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    // портрет
    const R = 140 * lerp(0.55, 1, easeBack(age / 1.0)) * (1 + 0.012 * Math.sin(T * 2.4));
    drawPortrait(WX, WY, R / 1, w, wn.col, smooth(age / 0.45), smooth(age / 0.25) * fadeA);
    // тексты
    const hA = smooth((age - 0.1) / 0.5) * fadeA, hy = 120 - (1 - easeOut((age - 0.1) / 0.6)) * 40;
    const total = wn.head.tw + 30 + wn.rnd.tw;
    drawSprite(wn.head, WX - total / 2 + wn.head.tw / 2, hy, 1, hA);
    drawSprite(wn.rnd, WX + total / 2 - wn.rnd.tw / 2, hy + 14, 1, hA);
    const nA = smooth((age - 0.3) / 0.5) * fadeA, nS = lerp(0.8, 1, easeBack((age - 0.3) / 0.7));
    drawSprite(wn.name, WX, 590, nS, nA);
    drawSprite(wn.subS, WX, 674, 1, smooth((age - 0.7) / 0.5) * fadeA);
  }

  let hudCount = -1;
  function drawHud() {
    const a = phase === "roll" ? 0.5 : phase === "win" ? 0 : 1, la = phase === "win" ? 0.5 : 1;
    if (a > 0) {
    const t1 = textSprite("CHISETUP · HALLOWEEN", { font: '700 22px "Exo 2", sans-serif', fill: "#ff6600", size: 22, ls: "7px", pad: 12 });
    drawSprite(t1, 56 + t1.w / 2, 62, 1, a);
    const t2 = textSprite(`Учасники  ${total}   ·   Квитки  ${totalTickets}`, { font: '700 34px "Exo 2", sans-serif', fill: "#f4f1ea", size: 34, pad: 12, sw: 4, stroke: "rgba(0,0,0,.6)" });
    drawSprite(t2, 56 + t2.w / 2, 108, 1, a);
    }
    // легенда
    const items = [["orange", "Гарбузи"], ["green", "Замовлення"], ["violet", "Обидва"]];
    let lx = 66;
    g.globalAlpha = 0.9 * la;
    for (const [c, tx] of items) {
      g.globalCompositeOperation = "lighter"; g.drawImage(glow[c], lx - 16, 1022 - 16, 32, 32); g.globalCompositeOperation = "source-over";
      const s = textSprite(tx, { font: '600 20px "Exo 2", sans-serif', fill: "#c9c4ba", size: 20, pad: 8 });
      drawSprite(s, lx + 12 + s.w / 2 - 6, 1022, 1, 0.9 * la);
      lx += s.w + 40;
    }
    g.globalAlpha = 1;
  }

  function caption(rt) {
    for (const [t0, t1, tx] of CAPTIONS) {
      if (rt >= t0 && rt < t1) {
        const a = smooth((rt - t0) / 0.3) * (1 - smooth((rt - (t1 - 0.25)) / 0.25));
        const rnd = textSprite(`Раунд ${rs.info.round} з ${rs.info.totalRounds}`, { font: '700 32px "Exo 2", sans-serif', fill: "#ff8a2a", glow: "#ff6600", blur: 10, size: 32, ls: "3px", pad: 18 });
        drawSprite(rnd, WX, 62, 1, 0.9);
        const s = textSprite(tx, { font: '700 54px "Exo 2", sans-serif', fill: "#f4f1ea", glow: "#7cff4f", blur: 22, size: 54, sw: 7, stroke: "rgba(0,0,0,.7)", pad: 30 });
        drawSprite(s, WX, 134, 1 + (1 - a) * 0.06, Math.max(0.0, a));
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
    if (Math.random() < dt * (2 + 26 * bl)) bubbles.push({ u: (Math.random() - 0.5) * 2, v: (Math.random() - 0.5) * 2, r: 5 + Math.random() * 12 + bl * 6, age: 0, life: 0.5 + Math.random() * 0.8 });
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.age += dt;
      if (!b.popped && b.age >= b.life) { b.popped = true; if (bl > 0.5 && Math.random() < 0.4) spark(PX + b.u * 210, PY + b.v * 36, (Math.random() - 0.5) * 60, -90 - Math.random() * 80, 0.5, 2 + Math.random() * 2, "green", { g: 400 }); }
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
      s.vy += s.g * dt; const dr = 1 - Math.min(1, s.drag * dt); s.vx *= dr; s.vy *= dr; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
    }
    if (phase === "win" && Math.random() < dt * (reduced ? 6 : 22) && sparks.length < 500) {
      spark(Math.random() * W, -10, (Math.random() - 0.5) * 60, 110 + Math.random() * 180, 6, 5 + Math.random() * 4, COLNAMES[(Math.random() * 3) | 0], { rect: 1 });
    }
    for (const b of bats) { b.x += b.v * dt; if (b.x > W + 200) { b.x = -300; b.y = 150 + Math.random() * 280; } }
    for (const m of mists) { m.x += m.v * dt; if (m.x > W + 400) m.x = -400; }
  }

  function render() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0e0e10"; g.fillRect(0, 0, cw, ch);
    g.setTransform(fit, 0, 0, fit, ox, oy);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.drawImage(bgC, 0, 0, W, H);

    const bl = clamp(boil + gulp * 0.35);
    // туман у земли
    g.globalCompositeOperation = "lighter";
    for (const m of mists) { g.globalAlpha = 0.10; g.drawImage(blobTint.violet, m.x - m.r, m.y - m.r * 0.45, m.r * 2, m.r * 0.9); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    for (const f of flies) {
      const x = f.x + Math.sin(T * f.sp + f.ph) * 40, y = f.y + Math.cos(T * f.sp * 0.8 + f.ph) * 30;
      g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.18 + 0.14 * Math.sin(T * 2 + f.ph); g.drawImage(glow[f.col], x - 7, y - 7, 14, 14);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    for (const b of bats) drawBat(b);

    drawSoulsPass(0);
    drawHero();

    // котёл
    const amp = shakeAmp + shakeKick;
    const sx = amp ? (Math.random() - 0.5) * 2 * amp * 0.6 : 0, sy = amp ? (Math.random() - 0.5) * amp * 0.35 : 0, rot = amp ? (Math.random() - 0.5) * amp * 0.0012 : 0;
    g.save(); g.translate(PX, PY + 200); g.rotate(rot); g.translate(-PX + sx, -(PY + 200) + sy);
    g.drawImage(potBackC, POT.x0, POT.y0, POT.w, POT.h);
    drawLiquid(bl);
    drawSoulsPass(1);
    g.drawImage(potFrontC, POT.x0, POT.y0, POT.w, POT.h);
    // зелёный отсвет на корпусе и светящееся лицо
    g.globalCompositeOperation = "lighter";
    const fl = faceI * (0.65 + 0.35 * Math.sin(T * 7 + Math.sin(T * 2.3) * 2));
    g.globalAlpha = clamp(0.2 + fl * 0.8 + gulp * 0.2);
    g.drawImage(faceC, PX - 140, PY + 72, 280, 166);
    g.globalAlpha = 0.1 + 0.25 * bl;
    g.drawImage(glow.green, PX - 330, PY - 90, 660, 260);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.restore();

    // вихрь искр из котла
    g.globalCompositeOperation = "lighter";
    const eInt = 0.25 + 0.75 * bl;
    for (const m of embers) {
      const h = frac(T * m.rate * (1 + bl * 1.5) + m.ph);
      const R = 30 + 250 * Math.pow(h, 0.85), a = m.a0 + m.dir * T * (1.4 - h * 0.6);
      const x = PX + Math.cos(a) * R, y = PY - 30 - 600 * h + Math.sin(a) * R * 0.2;
      const al = Math.sin(Math.PI * h) * eInt * (phase === "win" ? 0.7 : 0.9);
      const sz = m.sz * (1.7 - h) * 3.4;
      g.globalAlpha = al; g.drawImage(glow[m.col], x - sz / 2, y - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;

    // пар
    for (const p of puffs) {
      const q = p.life / p.max, a = p.a * Math.sin(Math.PI * Math.min(1, (1 - q) * 1.15)) * (0.35 + 0.65 * q);
      g.globalAlpha = Math.max(0, a); g.drawImage(blobTint[p.kind] || blobTint.smoke, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    drawSoulsPass(2);

    // ложный выброс: безымянный огонёк «пшик»
    if (rs) {
      const rt = T - rs.t0;
      if (rt >= T_F1 - 0.05 && rt < T_F1 + 0.55) {
        const q = (rt - T_F1 + 0.05) / 0.6, y = PY - 12 - Math.sin(q * Math.PI) * 120, a = 1 - q * q;
        g.globalCompositeOperation = "lighter"; const sz = 60 * (1 - q * 0.4);
        g.globalAlpha = a; g.drawImage(glow.pale, PX - sz / 2, y - sz / 2, sz, sz); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
      if (rt >= T_F2 && rt < T_F2_END) {
        const q = (rt - T_F2) / (T_F2_END - T_F2);
        const rise = q < 0.5 ? easeOut(q / 0.5) : q < 0.75 ? 1 : 1 - smooth((q - 0.75) / 0.25);
        const y = PY - 12 - rise * 230, x = PX + Math.sin(T * 26) * 5 * (q > 0.5 && q < 0.75 ? 1 : 0.2);
        const flick = q > 0.5 ? 0.45 + 0.55 * Math.abs(Math.sin(T * 30)) : 1;
        const sz = 150 * (0.6 + 0.4 * rise);
        g.globalCompositeOperation = "lighter"; g.globalAlpha = flick;
        g.drawImage(glow.pale, x - sz / 2, y - sz / 2, sz, sz);
        g.globalAlpha = 0.5 * flick; g.drawImage(glow.green, x - sz, y - sz, sz * 2, sz * 2);
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
        if (Math.random() < 0.5) spark(x, y, (Math.random() - 0.5) * 80, 30 + Math.random() * 60, 0.5, 3, "green", { g: 300 });
      }
      // душа победителя: вылет из котла
      if (rt >= T_EJECT && rt < T_REVEAL) {
        const u = (rt - T_EJECT) / (T_REVEAL - T_EJECT), e = easeOut(u), [wx, wy] = winnerPath(e);
        const col = colorFor(rs.winner), r = lerp(16, 112, e * e), sz = r * 5.5;
        g.globalCompositeOperation = "lighter"; g.globalAlpha = 1;
        g.drawImage(glow[col], wx - sz / 2, wy - sz / 2, sz, sz);
        g.drawImage(glow.pale, wx - sz / 4, wy - sz / 4, sz / 2, sz / 2);
        g.globalCompositeOperation = "source-over";
        const da = smooth((u - 0.55) / 0.45);
        if (da > 0.01) { g.globalAlpha = da; drawDisc(g, wx, wy, r, rs.winner.name, col, getImg(rs.winner.avatar)); g.globalAlpha = 1; }
      }
    }

    if (win) drawWinner(win);

    // искры и конфетти
    for (const s of sparks) {
      const a = Math.min(1, (s.life / s.max) * 1.6);
      if (s.rect) {
        g.globalAlpha = a; g.save(); g.translate(s.x, s.y); g.rotate(s.rot); g.fillStyle = COLS[s.col].css; g.fillRect(-s.size, -s.size * 0.4, s.size * 2, s.size * 0.8); g.restore();
      } else {
        g.globalCompositeOperation = "lighter"; g.globalAlpha = a; const sz = s.size * 4; g.drawImage(glow[s.col], s.x - sz / 2, s.y - sz / 2, sz, sz);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";

    // общий свет от котла + вспышка
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.07 + 0.2 * bl; g.drawImage(glow.green, PX - 760, PY - 560, 1520, 900);
    if (flash > 0) { g.globalAlpha = flash; g.drawImage(glow.pale, PX - 1200, WY - 800, 2400, 1600); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";

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
  if (document.fonts?.load) {
    Promise.all([document.fonts.load('800 40px "Exo 2"', "Аа Aa"), document.fonts.load('600 20px "Exo 2"', "Аа Aa")]).then(() => {
      spriteCache.clear(); souls.forEach((s) => { s.badge = null; s.label = null; });
    }).catch(() => {});
  }

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
