// Graveyard visual, 16-bit pixel-art edition: every sprite is rasterised once, pixel by pixel, into small
// bitmaps (1 art pixel = UNIT0 design px at level 0, twice as much per next level). Shading is 3-4 hard tones
// plus ordered (Bayer) dithering, outlines are 1 art pixel of ink. No gradients, no blur, no smoothing.
// The renderer blits them nearest-neighbour into a 480x270 layer (see index.js).
export const SW = 320, SH = 440, GY = 402; // stone bitmap size (design px) and the line the stone stands on
export const TIER_H = [235, 282, 326, 356];
export const UNIT0 = 2.5, LEVELS = 4; // level k has unit UNIT0 * 2^k

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

// ---------------------------------------------------------------- tiny raster toolkit
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bay = (i, j) => BAY[((j & 3) << 2) | (i & 3)];
const hx = (s) => { const n = parseInt(s.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255, 255]; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nz = (i, j, s) => { let h = Math.imul(((i * 374761393) ^ (j * 668265263) ^ (s * 2147483647)) | 0, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Fill a w×h bitmap from fn(i,j) → [r,g,b,a?] | null. */
function raster(w, h, fn) {
  const c = cv(w, h), g = c.getContext("2d"), im = g.createImageData(w, h), d = im.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const col = fn(i, j); if (!col) continue;
    const o = (j * w + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col[3] === undefined ? 255 : col[3];
  }
  g.putImageData(im, 0, 0);
  return c;
}
/** A continuous tone value → integer tone with ordered dithering between steps. */
// hard bands (no ordered dithering: crisp pixels)
const tone = (t, i, j, n = 3) => Math.min(n, Math.floor(clamp(t, 0, n) + 0.5));
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}
function segDist(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy, t = l ? clamp(((x - x0) * dx + (y - y0) * dy) / l, 0, 1) : 0;
  return Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
}
/** 1-art-pixel Bresenham line of fillRects on a bitmap context. */
function line(g, x0, y0, x1, y1) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 4000; n++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const OUT = hx("#1a0f24"), INK = hx("#0e0e10");
const STONE = ["#b4b0cc", "#8b86a8", "#625d84", "#433e62"].map(hx);
const STONE_LIT = ["#ffe6b0", "#eab677", "#b6743f", "#74442b"].map(hx);

// ---------------------------------------------------------------- stones
function makeBody(tier, v) {
  const H = TIER_H[tier - 1], top = GY - H, ry3 = tier === 3 ? 160 : 150;
  const spikes = [];
  if (tier === 3 && v === 1) for (const s of [-1, 1]) { const cx = 160 + s * 128; spikes.push([[cx - 14, GY - 150], [cx, top + 78], [cx + 14, GY - 150]]); }
  return (x, y) => {
    if (y > GY) return false;
    if (x >= 40 && x <= 280) {
      const dx = Math.abs(x - 160);
      if (tier === 1) { if (v === 0) { if (y >= top + 120 || (y >= top && inEll(x, y, 160, top + 120, 120, 120))) return true; } else if (y >= top && dx <= 120 - Math.max(0, top + 50 - y)) return true; }
      else if (tier === 2) { if (v === 0) { if (y >= top + 130 || (y >= top && inEll(x, y, 160, top + 130, 120, 130))) return true; } else if (y >= top + 92 * Math.pow(dx / 120, 0.8)) return true; }
      else if (y >= top + ry3 || (y >= top && inEll(x, y, 160, top + ry3, 120, ry3))) return true;
    }
    for (const p of spikes) if (inPoly(p, x, y)) return true;
    if (tier === 4) {
      if (x >= 26 && x <= 294 && y >= GY - 42) return true;
      if (x >= 153 && x <= 167 && y >= top - 38 && y <= top + 16) return true;
      if (x >= 139 && x <= 181 && y >= top - 24 && y <= top - 12) return true;
    }
    return false;
  };
}
/** 0 none, 1 engraved dark, 2 bone, 3 ink, 4 wing */
function makeEmblem(tier, v, y0) {
  return (x, y) => {
    if (tier === 1) { if (Math.abs(x - 160) <= 7 && y >= y0 - 24 && y <= y0 + 26) return 1; if (Math.abs(y - (y0 - 8)) <= 7 && Math.abs(x - 160) <= 20) return 1; return 0; }
    if (tier === 2) {
      if (v === 0) { const e = ((x - 160) / 26) ** 2 + ((y - y0 - 4) / 20) ** 2; if (e <= 1 && (e >= 0.5 || Math.abs(x - 160) <= 4)) return 1; if (Math.abs(x - 163) <= 3 && y >= y0 - 28 && y < y0 - 14) return 1; return 0; }
      const a = inEll(x, y, 160, y0, 22, 22), b = inEll(x, y, 170, y0 - 2, 17, 17);
      if (a && !b) return 1; if ((x - 190) ** 2 + (y - y0 + 16) ** 2 <= 25) return 1; return 0;
    }
    const s = tier === 3 ? 1.15 : 1.05, cy = tier === 3 ? y0 : y0 + 4;
    if (inEll(x, y, 160 - 8 * s, cy - 3 * s, 5.5 * s, 6.5 * s) || inEll(x, y, 160 + 8 * s, cy - 3 * s, 5.5 * s, 6.5 * s)) return 3;
    if (inPoly([[160, cy + 4 * s], [160 - 3.5 * s, cy + 10 * s], [160 + 3.5 * s, cy + 10 * s]], x, y)) return 3;
    for (let i = -1; i <= 1; i++) if (Math.abs(x - (160 + i * 5 * s)) <= 1.3 * s && y >= cy + 14 * s && y <= cy + 24 * s) return 3;
    if (inEll(x, y, 160, cy - 3 * s, 21 * s, 19 * s) || (Math.abs(x - 160) <= 11 * s && y >= cy + 12 * s && y <= cy + 24 * s)) return 2;
    if (tier === 4) for (const sd of [-1, 1]) if (inPoly([[160 + sd * 26, cy - 4], [160 + sd * 62, cy - 34], [160 + sd * 90, cy - 6], [160 + sd * 62, cy + 14]], x, y)) return 4;
    return 0;
  };
}

function bakeStoneLevel(tier, v, lit, k) {
  const unit = UNIT0 * 2 ** k, w = Math.ceil(SW / unit), h = Math.ceil(SH / unit);
  const H = TIER_H[tier - 1], top = GY - H, body = makeBody(tier, v), emb = makeEmblem(tier, v, GY - H * 0.67);
  const pal = lit ? STONE_LIT : STONE, seed = tier * 131 + v * 17 + 9, R = rng(seed);
  const sc = (x, y) => body(160 + (x - 160) / 0.84, GY + (y - GY) / 0.9);
  const cracks = [];
  if (tier <= 2) { let x = 70 + R() * 180, y = top + 30 + R() * 40; for (let i = 0; i < 6; i++) { const nx = x + (R() - 0.5) * 22, ny = y + 12 + R() * 14; cracks.push([x, y, nx, ny]); x = nx; y = ny; } }
  const moss = []; for (let i = 0; i < 4; i++) moss.push([55 + R() * 210, GY - 6 - R() * 46, 22 + R() * 30, 9 + R() * 12]);
  const mossC = lit ? [hx("#9aa850"), hx("#6a7a34")] : [hx("#5fae2a"), hx("#2f7a1c")];
  const embC = lit ? [null, hx("#7a3c18"), hx("#fff0c0"), INK, hx("#8a4c20")] : [null, hx("#2c2748"), hx("#ece6d4"), INK, hx("#3a3460")];
  const hiC = lit ? hx("#ffe0a0") : hx("#c4c8ff");
  const moundC = lit ? ["#5a4030", "#3a2a22", "#241812"].map(hx) : ["#3d3350", "#2b2433", "#1c1626"].map(hx);
  const barY = GY - H * 0.38 + 34;
  const bar = (x, y) => Math.abs(y - barY) <= 3 && x >= 112 && x <= 208;
  const c = raster(w, h, (i, j) => {
    const x = (i + 0.5) * unit, y = (j + 0.5) * unit;
    if (body(x, y)) {
      if (!body(x - unit, y) || !body(x + unit, y) || !body(x, y - unit) || !body(x, y + unit)) return tier === 4 ? INK : OUT;
      for (const m of moss) { const e = ((x - m[0]) / m[2]) ** 2 + ((y - m[1]) / m[3]) ** 2; if (e <= 1 && e < 0.6) return mossC[nz(i, j, 5) > 0.55 ? 0 : 1]; }
      if (k <= 2) for (const s of cracks) if (segDist(x, y, s[0], s[1], s[2], s[3]) <= unit * 0.62) return OUT;
      if (tier >= 2 && k <= 1 && y < GY - 16 && sc(x, y) && (!sc(x - unit, y) || !sc(x + unit, y) || !sc(x, y - unit) || !sc(x, y + unit))) return pal[3];
      const e = emb(x, y);
      if (e && k <= 2) return embC[e];
      if (k <= 2 && ((emb(x, y - unit) === 1 || emb(x, y - unit) === 4) || (bar(x, y - unit) && !bar(x, y)))) return hiC;
      if (k <= 2 && bar(x, y)) return embC[1];
      const u = (x - 40) / 240, vv = (y - top) / H;
      let t = clamp(u * 1.9 - 0.15 + vv * 0.8, 0, 2.9);
      if (!body(x, y - 7) || !body(x - 6, y)) t -= 0.9;
      if (!body(x + 6, y) && body(x, y + 7)) t += 0.5;
      if (k <= 1) { const n = nz(i, j, seed); if (n < 0.07) t += 0.9; else if (n > 0.95) t -= 0.8; }
      return pal[tone(t, i, j)];
    }
    if (tier === 4) { // hard orange rim around the big stone instead of a glow
      if (body(x - unit, y) || body(x + unit, y) || body(x, y - unit) || body(x, y + unit)) return hx("#ff6600");
    }
    // candles on the plinth
    if (tier === 4) for (const cx of [48, 272]) {
      if (Math.abs(x - cx) <= 6 && y >= GY - 66 && y <= GY - 40) return hx("#efe4c8");
      if (inEll(x, y, cx, GY - 76, 5, 10)) return Math.abs(x - cx) <= 2 && y > GY - 80 ? hx("#fff6c8") : hx("#ffdc7a");
    }
    const e = ((x - 160) / 142) ** 2 + ((y - GY - 4) / 27) ** 2;
    if (e <= 1) return moundC[tone(e * 2.4, i, j, 2)];
    return null;
  });
  const g = c.getContext("2d"), R2 = rng(seed + 1);
  const greens = lit ? ["#7a8a3a", "#98a848", "#566a28", "#b4b860"] : ["#2d6a1c", "#3d8a24", "#1f5c10", "#5fae2a"];
  for (let n = 0; n < 80; n++) {
    const a = R2() * Math.PI * 2, rr = Math.sqrt(R2()), x = 160 + Math.cos(a) * 132 * rr, y = GY + 3 + Math.sin(a) * 22 * rr, hh = 7 + R2() * 15, col = greens[(R2() * 4) | 0];
    const hp = Math.max(1, Math.round(hh / unit)), i = Math.floor(x / unit), j = Math.floor(y / unit);
    g.fillStyle = col; g.fillRect(i, j - hp + 1, 1, hp);
  }
  for (let n = 0; n < 6; n++) { g.fillStyle = ["#c2651f", "#a2461a", "#7a3515"][n % 3]; g.fillRect(Math.floor((70 + R2() * 180) / unit), Math.floor((GY + 4 + R2() * 14) / unit), Math.max(1, Math.round(8 / unit)), 1); }
  return c;
}

const BROKEN_L = [[44, GY], [44, GY - 152], [66, GY - 170], [88, GY - 140], [112, GY - 178], [130, GY - 118], [146, GY - 134], [140, GY]];
const BROKEN_R = [[184, GY], [196, GY - 82], [226, GY - 112], [252, GY - 92], [284, GY - 40], [284, GY]];
function bakeBrokenLevel(k) {
  const unit = UNIT0 * 2 ** k, w = Math.ceil(SW / unit), h = Math.ceil(SH / unit), pal = STONE.map((c) => [c[0] * 0.8, c[1] * 0.8, c[2] * 0.85, 255]);
  const body = (x, y) => inPoly(BROKEN_L, x, y) || inPoly(BROKEN_R, x, y);
  const slime = ["#7cff4f", "#4cb040", "#24703a", "#16402c"].map(hx), moundC = ["#3d3350", "#2b2433", "#1c1626"].map(hx);
  const c = raster(w, h, (i, j) => {
    const x = (i + 0.5) * unit, y = (j + 0.5) * unit;
    if (body(x, y)) {
      if (!body(x - unit, y) || !body(x + unit, y) || !body(x, y - unit) || !body(x, y + unit)) return OUT;
      return pal[tone(((x - 44) / 240) * 2.4 + (!body(x, y - 7) ? -0.8 : 0.3) + ((GY - y) / 180) * -0.5, i, j)];
    }
    const pool = ((x - 160) / 74) ** 2 + ((y - GY + 8) / 17) ** 2;
    if (inEll(x, y, 160, GY - 2, 36, 9)) return hx("#05060a");
    if (pool <= 1) return slime[3 - tone((1 - pool) * 3.2, i, j, 3)];
    const e = ((x - 160) / 142) ** 2 + ((y - GY - 4) / 27) ** 2;
    if (e <= 1) return moundC[tone(e * 2.4, i, j, 2)];
    return null;
  });
  const g = c.getContext("2d"), R2 = rng(77);
  const greens = ["#2d6a1c", "#3d8a24", "#1f5c10", "#5fae2a"];
  for (let n = 0; n < 70; n++) {
    const a = R2() * Math.PI * 2, rr = Math.sqrt(R2()), x = 160 + Math.cos(a) * 132 * rr, y = GY + 3 + Math.sin(a) * 22 * rr, hh = 7 + R2() * 15;
    g.fillStyle = greens[(R2() * 4) | 0]; const hp = Math.max(1, Math.round(hh / unit)); g.fillRect(Math.floor(x / unit), Math.floor(y / unit) - hp + 1, 1, hp);
  }
  return c;
}

export function bakeStones() {
  const out = { s: {}, broken: [], meta: {} };
  for (let k = 0; k < LEVELS; k++) out.broken.push(bakeBrokenLevel(k));
  for (let t = 1; t <= 4; t++) {
    out.meta[t] = { nameY: GY - TIER_H[t - 1] * 0.38, emblemY: GY - TIER_H[t - 1] * 0.67 };
    for (let v = 0; v < 2; v++) out.s[`${t}${v}`] = [0, 1].map((lit) => Array.from({ length: LEVELS }, (_, k) => bakeStoneLevel(t, v, !!lit, k)));
  }
  return out;
}

/** Left and right halves of an unlit stone (level 0), split along the winner's crack line. */
const CRACK_N = [[0, 0], [-0.07, 0.14], [0.05, 0.27], [-0.09, 0.42], [0.06, 0.58], [-0.05, 0.74], [0.02, 0.88], [0, 1]];
export function bakeHalves(src, tier) {
  const unit = UNIT0, w = src.width, h = src.height, TH = TIER_H[tier - 1];
  const sd = src.getContext("2d").getImageData(0, 0, w, h).data;
  const crackX = (y) => {
    const dv = (y - (GY - TH)) / TH;
    if (dv <= 0) return 160 + CRACK_N[0][0] * 240;
    if (dv >= 1) return 160 + CRACK_N[CRACK_N.length - 1][0] * 240;
    const f = dv * (CRACK_N.length - 1), i = Math.floor(f);
    return 160 + (CRACK_N[i][0] + (CRACK_N[i + 1][0] - CRACK_N[i][0]) * (f - i)) * 240;
  };
  const mk = (side) => raster(w, h, (i, j) => {
    const x = (i + 0.5) * unit, y = (j + 0.5) * unit, cx = crackX(y), o = (j * w + i) * 4;
    if (side < 0 ? x >= cx : x < cx) return null;
    if (!sd[o + 3]) return null;
    return [sd[o], sd[o + 1], sd[o + 2], 255];
  });
  return { L: mk(-1), R: mk(1) };
}

// ---------------------------------------------------------------- pumpkin (3 sizes: 40, 20, 10 art px wide)
const PUMP_ORANGE = ["#ffb347", "#ff6600", "#c24a00", "#7a2c00"].map(hx);
function bakePumpkinLevel(wpx) {
  const unit = 120 / wpx, w = wpx, h = Math.ceil(104 / unit);
  const lobes = [[34, 64, 26, 30], [86, 64, 26, 30], [60, 62, 36, 34]];
  const body = (x, y) => lobes.some((l) => inEll(x, y, l[0], l[1], l[2], l[3]));
  const eyes = [[[40, 58], [54, 58], [47, 46]], [[66, 58], [80, 58], [73, 46]]];
  const mouth = [[36, 72], [46, 80], [53, 73], [60, 82], [67, 73], [74, 80], [84, 72], [78, 88], [60, 92], [42, 88]];
  const stem = [[54, 30], [58, 14], [68, 12], [66, 30]];
  const carved = (x, y) => eyes.some((p) => inPoly(p, x, y)) || inPoly(mouth, x, y);
  return raster(w, h, (i, j) => {
    const x = (i + 0.5) * unit, y = (j + 0.5) * unit;
    if (inPoly(stem, x, y)) return hx("#5a4520");
    if (segDist(x, y, 66, 22, 80, 10) <= unit * 0.8 || segDist(x, y, 80, 10, 90, 20) <= unit * 0.8) return hx("#7cff4f");
    if (body(x, y)) {
      if (!body(x - unit, y) || !body(x + unit, y) || !body(x, y - unit) || !body(x, y + unit)) return INK;
      if (carved(x, y)) return hx(y > 60 && wpx >= 20 && ((j + (i >> 1)) & 1) ? "#ffd070" : "#ffeb8a");
      let t = ((x - 20) / 80) * 1.3 + ((y - 30) / 64) * 1.1 - 0.4;
      if (Math.abs(x - 46) < unit * 0.7 || Math.abs(x - 74) < unit * 0.7) t += 0.9;
      return PUMP_ORANGE[tone(t, i, j)];
    }
    return null;
  });
}
export const bakePumpkin = () => [40, 20, 10].map(bakePumpkinLevel);

// ---------------------------------------------------------------- fog tile, haze, vignette, ground, far silhouette
/** A 256×64 art-px fog tile: hard 3-step puffs with dithered edges. tint = "r,g,b". */
export function bakeFog(seed, tint) {
  const w = 256, h = 64, R = rng(seed), [r, g2, b] = tint.split(",").map(Number), blobs = [];
  for (let n = 0; n < 15; n++) blobs.push([R() * w, h * (0.34 + R() * 0.32), 14 + R() * 30, 5 + R() * 7]);
  const A = [0, 48, 92, 140];
  return raster(w, h, (i, j) => {
    let d = 0;
    for (const bl of blobs) for (const ox of [-w, 0, w]) { const e = 1 - Math.hypot((i - bl[0] - ox) / bl[2], (j - bl[1]) / bl[3]); if (e > 0) d = Math.max(d, e); }
    const lv = tone(d * 3.2, i, j);
    return lv ? [r, g2, b, A[lv]] : null;
  });
}

/** Dithered light mist along the horizon: violet everywhere, green in the middle (like bg-night). */
export function bakeHaze(wA) {
  const h = 40;
  const A = [0, 46, 80, 118];
  return raster(wA, h, (i, j) => {
    const p = 1 - Math.abs(j - 22) / 22; if (p <= 0) return null;
    const n = 0.65 + 0.35 * Math.sin(i * 0.09) * Math.sin(i * 0.031 + 1);
    const lv = tone(p * n * 3.3, i, j); if (!lv) return null;
    return [138, 63, 252, A[lv]]; // one colour over the full width: no rectangle edges
  });
}

/** Dark corners in 3 dithered steps. Layer-sized. */
export function bakeVignette(wA, hA) {
  const A = [0, 50, 100, 150];
  return raster(wA, hA, (i, j) => {
    const dx = (i / wA - 0.5) * 2, dy = (j / hA - 0.52) * 2, d = Math.hypot(dx * 0.82, dy);
    const lv = tone(clamp((d - 0.62) / 0.5, 0, 1) * 3, i, j); return lv ? [3, 1, 8, A[lv]] : null;
  });
}

/** A dithered dark pool for the finale: transparent centre (inner radius ~55 art px), solid outside. 200×120. */
export function bakeDark() {
  const w = 200, h = 120, A = [0, 60, 112, 160];
  return raster(w, h, (i, j) => {
    const d = Math.hypot((i - 100) * 0.62, (j - 60) * 1.0 * 0.62 * 1.6);
    const lv = tone(clamp((d - 34) / 30, 0, 1) * 3, i, j); return lv ? [3, 1, 10, A[lv]] : null;
  });
}

/** The ground below the horizon, wA×hA art px: 5 stepped plum bands, dither between, green mist at the back. */
export function bakeGround(wA, hA) {
  const ramp = ["#3b2654", "#2c1a3c", "#211230", "#170d24", "#0e0a16"].map(hx), moss = hx("#1f5c10"), rust = hx("#5a2200"), vio = hx("#4a2a70");
  return raster(wA, hA, (i, j) => {
    const t = j / hA;
    const base = ramp[tone(Math.pow(t, 0.7) * 4.2, i, j, 4)];
    const n = nz(i, j, 11);
    if (j < 3) return hx("#2c6a30");
    if (n < 0.012) return moss; if (n > 0.994) return rust; if (n > 0.985 && t < 0.5) return vio;
    return base;
  });
}

function branch(g, x, y, ang, len, depth, R, maxX) {
  if (depth <= 0 || len < 2) return;
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  line(g, x, y, x2, y2);
  const n = 2 + (R() < 0.3 ? 1 : 0);
  for (let i = 0; i < n; i++) branch(g, x2, y2, ang + (R() - 0.5) * 1.6 - (i === 0 ? 0.1 : 0), len * (0.68 + R() * 0.14), depth - 1, R, maxX);
}
/** Far ridge with dead trees and a chapel with lit windows, wA art px wide, 62 tall; the bottom edge is the horizon. */
export function bakeFar(wA) {
  const h = 62, c = cv(wA, h), g = c.getContext("2d"), R = rng(21);
  const ridge = (col, amp, base, ph) => {
    g.fillStyle = col;
    for (let i = 0; i < wA; i++) { const y = Math.round(base - amp * (0.55 * Math.sin(i * 0.016 + ph) + 0.3 * Math.sin(i * 0.044 + ph * 2) + 0.15 * Math.sin(i * 0.12))); g.fillRect(i, y, 1, h - y); }
  };
  ridge("#1d1230", 16, h - 18, 1);
  g.fillStyle = "#1d1230"; for (let n = 0; n < 9; n++) { const x = (n + R() * 0.8) * (wA / 9); branch(g, x, h - 18, -Math.PI / 2 + (R() - 0.5) * 0.3, 8 + R() * 7, 5, R, wA); }
  const cx = Math.round(wA * 0.7), by = h - 20;
  g.fillStyle = "#150d22"; g.fillRect(cx - 10, by - 12, 20, 14);
  for (let r = 0; r < 10; r++) g.fillRect(cx - 12 + r, by - 12 - r, 24 - r * 2, 1);
  g.fillRect(cx + 10, by - 25, 6, 27); for (let r = 0; r < 8; r++) g.fillRect(cx + 9 + r, by - 25 - r, 8 - r * 2 + 1 > 0 ? Math.max(1, 8 - r * 2) : 1, 1);
  g.fillStyle = "#ffae42"; g.fillRect(cx - 2, by - 8, 3, 5); g.fillRect(cx + 12, by - 20, 2, 3);
  ridge("#120a1e", 11, h - 9, 3);
  g.fillStyle = "#120a1e"; for (let n = 0; n < 12; n++) { const x = R() * wA; branch(g, x, h - 10, -Math.PI / 2 + (R() - 0.5) * 0.4, 5 + R() * 6, 4, R, wA); }
  return c;
}

/** The cemetery gate with the ChiSetup sign: 130×90 art px. `fam` is the pixel font family. */
export function bakeGate(fam, pumpkin10) {
  const w = 130, h = 90, c = cv(w, h), g = c.getContext("2d"), R = rng(33);
  const F = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  const archY = (x) => Math.round(38 - 28 * Math.pow(Math.sin(Math.PI * clamp((x - 16) / 98, 0, 1)), 0.8));
  // iron bars + spikes
  for (let x = 21; x <= 109; x += 5) { const y0 = archY(x) + 3; F(x, y0, 1, h - y0, "#0b0a12"); F(x, y0 - 3, 1, 3, "#0b0a12"); F(x - 1, y0 - 1, 3, 1, "#0b0a12"); }
  for (let x = 16; x <= 114; x++) F(x, archY(x), 1, 2, "#0b0a12");
  F(18, 52, 94, 2, "#0b0a12"); F(18, 80, 94, 2, "#0b0a12");
  // pillars
  for (const px0 of [0, 112]) {
    F(px0, 25, 18, 65, "#463f66");
    F(px0 + 12, 25, 6, 65, "#2b2644"); F(px0 + 16, 25, 2, 65, "#1c1830"); F(px0, 25, 2, 65, "#6a6392");
    for (let y = 30; y < 90; y += 6) { F(px0, y, 18, 1, "#1c1830"); for (let x = px0 + ((y / 6) & 1 ? 4 : 10); x < px0 + 18; x += 12) F(x, y - 6, 1, 6, "#1c1830"); }
    F(px0 - 2, 20, 22, 5, "#5d5682"); F(px0 - 2, 24, 22, 1, "#1c1830"); F(px0 - 2, 20, 22, 1, "#8a83b4");
    F(px0 - 1, 25, 1, 1, "#0e0e10");
  }
  for (const px0 of [3, 117]) g.drawImage(pumpkin10, px0, 11, 10, Math.round(10 * 104 / 120));
  // sign
  F(46, 8, 1, 14, "#1b1b26"); F(83, 8, 1, 14, "#1b1b26");
  F(36, 20, 58, 18, "#0e0e10"); F(37, 21, 56, 16, "#ff6600"); F(38, 22, 54, 14, "#4a2d19"); F(38, 22, 54, 1, "#7b5230"); F(38, 29, 54, 1, "#3a230f");
  for (const [x, y] of [[39, 23], [90, 23], [39, 34], [90, 34]]) F(x, y, 1, 1, "#e0c890");
  g.font = `700 9px ${fam}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#0e0e10"; g.fillText("Chi", 55, 30.5); g.fillText("Setup", 77, 30.5);
  g.fillStyle = "#ffe2c0"; g.fillText("Chi", 54, 29.5); g.fillStyle = "#ff6600"; g.fillText("Setup", 76, 29.5);
  g.fillStyle = "#c8cde8"; for (let i = 0; i < 5; i++) { F(18 + i * 2 + (i & 1), 27 + i, 1, 1, "#9aa0c8"); }
  return c;
}

// ---------------------------------------------------------------- small sprites
const BAT_A = ["oo.........oo", "ooo..o.o..ooo", ".ooooooooooo.", "..ooooooooo..", "....o...o...."];
const BAT_B = ["....o...o....", "..ooooooooo..", ".ooooooooooo.", "ooo.ooooo.ooo", "o...........o"];
export function bakeBats() {
  return [BAT_A, BAT_B].map((rows) => raster(13, 5, (i, j) => (rows[j][i] === "o" ? hx("#140c20") : null)));
}

/** The zombie fist that holds the sign: 24×16 art px. */
export function bakeHand() {
  const skin = hx("#9bb98a"), hi = hx("#c4dcae"), sh = hx("#6a8c5e"), dk = hx("#42603c");
  const body = (i, j) => (i >= 3 && i <= 20 && j >= 1 && j <= 10 && !((i === 3 || i === 20) && (j === 1 || j === 10))) || (i >= 20 && i <= 23 && j >= 4 && j <= 8) || (i >= 6 && i <= 17 && j >= 11 && j <= 15);
  return raster(24, 16, (i, j) => {
    if (!body(i, j)) return null;
    if (!body(i - 1, j) || !body(i + 1, j) || !body(i, j - 1) || !body(i, j + 1)) return hx("#1c2a1a");
    if (j >= 11) return i < 8 ? skin : i > 14 ? dk : sh;
    if (j <= 6 && (i === 8 || i === 13 || i === 17)) return dk;
    if (j === 2) return hi;
    if (j >= 8) return sh;
    return skin;
  });
}

// ---------------------------------------------------------------- the ghost (mascot under a sheet, with a lantern)
export const GHOST = { x0: -80, y0: -92, w: 160, h: 184 };
const HEADS = { a: null, b: null };
function prepHead(img, an) {
  if (!img || !img.naturalWidth) return null;
  const c = cv(img.naturalWidth, img.naturalHeight), g = c.getContext("2d"); g.drawImage(img, 0, 0);
  return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, an };
}
export function setHeads(a, b) { HEADS.a = prepHead(a, [39, 17]); HEADS.b = prepHead(b, [32, 17]); }
const GH = ["#f6f8ff", "#d6e0ff", "#a8b4ec", "#7a82c8"].map(hx);
const ghostCache = new Map();
export function ghostSprite(frame, lean2, blink, level) {
  const key = `${frame}|${lean2}|${blink ? 1 : 0}|${level}`;
  let c = ghostCache.get(key); if (c) return c;
  const unit = UNIT0 * 2 ** level, W = Math.ceil(GHOST.w / unit), H = Math.ceil(GHOST.h / unit), { x0, y0 } = GHOST;
  const lean = lean2 / 2, tail = -lean * 26, ph = (frame * Math.PI) / 2, swing = Math.sin((frame * Math.PI) / 2) * 5, head = blink ? HEADS.b : HEADS.a, su = 1.8;
  const sheet = (x, y) => {
    if (y < -30) return inEll(x, y, 0, -30, 37, 42);
    const s = clamp((y + 30) / 88, 0, 1), w = 36 + 24 * Math.pow(s, 1.2), shf = tail * Math.pow(s, 1.3);
    if (Math.abs(x - shf) > w) return false;
    return y <= 58 || y <= 58 + 15 * Math.abs(Math.sin((Math.PI * (x - shf)) / 20 + ph));
  };
  const arms = (x, y) => segDist(x, y, -34, -2, -62, 22) <= 7 || segDist(x, y, 34, -2, 64, -22 + swing) <= 7;
  const solid = (x, y) => sheet(x, y) || arms(x, y) || inEll(x, y, 0, -28, 34, 33);
  const flame = frame & 1 ? hx("#ffffe0") : hx("#fff0b8");
  c = raster(W, H, (i, j) => {
    const x = x0 + (i + 0.5) * unit, y = y0 + (j + 0.5) * unit;
    // lantern hanging from the left hand
    if (Math.abs(x + 66) <= 2.5 && y >= 20 && y < 32) return INK;
    if (x >= -77 && x <= -55 && y >= 30 && y < 37) return INK;
    if (x >= -77 && x <= -55 && y >= 64 && y < 71) return INK;
    if (x >= -73 && x <= -59 && y >= 37 && y < 64) { if (Math.abs(x + 66) <= 1.4) return INK; if (Math.abs(x + 66) <= 4.5 && y > 41 && y < 60) return flame; return hx("#ffb44a"); }
    if (!solid(x, y)) return null;
    if (!solid(x - unit, y) || !solid(x + unit, y) || !solid(x, y - unit) || !solid(x, y + unit)) return OUT;
    if (inEll(x, y, 0, -28, 27, 26)) {
      if (head) {
        const sx = Math.floor(x / su + head.an[0]), sy = Math.floor((y + 28) / su + head.an[1]);
        if (sx >= 0 && sy >= 0 && sx < head.w && sy < head.h) { const o = (sy * head.w + sx) * 4; if (head.d[o + 3] > 128) return [head.d[o], head.d[o + 1], head.d[o + 2], 255]; }
      }
      return hx("#08060f");
    }
    if (inEll(x, y, 0, -28, 34, 33)) return x + y > 12 ? GH[1] : GH[0];
    if (!sheet(x, y)) return x > 0 ? GH[1] : GH[0];
    const s = clamp((y + 30) / 88, 0, 1), w = 36 + 24 * Math.pow(s, 1.2), shf = tail * Math.pow(s, 1.3), u = (x - shf + w) / (2 * w);
    return GH[tone(u * 2.5 - 0.25 + s * 0.35, i, j)];
  });
  ghostCache.set(key, c);
  return c;
}
