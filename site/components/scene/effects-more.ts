/**
 * Second batch of canvas backgrounds (SceneFx): themed after what the shop sells — a backlit
 * keyboard, a mouse sensor, a sound wave — plus a few generative techniques (ASCII flow,
 * reaction–diffusion, ordered dither). Every painter keeps its state in the closure.
 */
import { edgeFactor, type Draw } from "./fx-types";

const ORANGE = [255, 102, 0] as const;
const BG = [14, 14, 16] as const;

/* ---------------------------------------------------------------- keys: a backlit keyboard under the page */

export const keys: Draw = (env) => {
  const U = 46;
  const GAP = 6;
  type Key = { x: number; y: number; w: number; glow: number };
  const ks: Key[] = [];
  // rows staggered like a real board, a wide key at the row starts
  for (let r = 0, y = 4; y < env.h + U; r++, y += U + GAP) {
    let x = -((r * 0.25) % 1) * U - U / 2;
    let c = 0;
    while (x < env.w + U) {
      const w = c === 0 && r % 2 ? U * 1.5 : r % 5 === 4 && c === 6 ? U * 5 : U;
      ks.push({ x, y, w, glow: 0 });
      x += w + GAP;
      c++;
    }
  }
  const edge = edgeFactor(env, 0.3);
  const calm = ks.map((k) => edge(k.x + k.w / 2, k.y + U / 2));
  const waves: { x: number; y: number; age: number }[] = [];
  let lx = -1e4;
  let ly = -1e4;
  let typing = 0;
  const LV = 10;
  const buckets: number[][] = Array.from({ length: LV }, () => []);
  return (ctx, e, t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    if (e.pointer && Math.hypot(e.px - lx, e.py - ly) > 120) {
      waves.push({ x: e.px, y: e.py, age: 0 });
      lx = e.px;
      ly = e.py;
    }
    for (const w of waves) w.age += dt;
    while (waves.length && waves[0].age > 1.6) waves.shift();
    // «someone is typing»: a random key flashes every ~0.12 s
    typing += dt;
    while (typing > 0.12) {
      typing -= 0.12;
      ks[(Math.random() * ks.length) | 0].glow = 1;
    }
    for (const b of buckets) b.length = 0;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const cx = k.x + k.w / 2;
      const cy = k.y + U / 2;
      k.glow *= Math.exp(-dt * 2.2);
      // the backlight «breathing» wave across the board
      let l = Math.max(0, Math.sin(cx * 0.004 + cy * 0.002 - t * 0.9)) ** 6 * 0.45;
      for (const w of waves) {
        const d = Math.hypot(cx - w.x, cy - w.y) - w.age * 520;
        if (d > -60 && d < 60) l += (1 - Math.abs(d) / 60) * (1 - w.age / 1.6);
      }
      l = Math.min(1, (l + k.glow) * calm[i]);
      buckets[Math.min(LV - 1, Math.floor(l * LV))].push(i);
    }
    ctx.lineWidth = 1;
    for (let b = 0; b < LV; b++) {
      if (!buckets[b].length) continue;
      const a = b / LV;
      ctx.beginPath();
      for (const i of buckets[b]) ctx.roundRect(ks[i].x + 0.5, ks[i].y + 0.5, ks[i].w, U, 7);
      if (b > 0) {
        ctx.fillStyle = `rgba(255,102,0,${a * 0.28})`;
        ctx.fill();
      }
      ctx.strokeStyle = b > 0 ? `rgba(255,133,51,${0.06 + a * 0.6})` : "rgba(255,255,255,.035)";
      ctx.stroke();
    }
  };
};

/* ---------------------------------------------------------------- ascii: glyphs following a flowing field */

export const ascii: Draw = (env) => {
  const CW = 11;
  const CH = 16;
  const RAMP = " .,:;-=+*x#%@";
  const LV = 6;
  // glyph atlas: RAMP.length glyphs × LV brightness levels, drawn once
  const atlas = document.createElement("canvas");
  atlas.width = RAMP.length * CW * env.dpr;
  atlas.height = LV * CH * env.dpr;
  const g = atlas.getContext("2d")!;
  g.scale(env.dpr, env.dpr);
  g.font = `600 12px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace`;
  g.textBaseline = "middle";
  g.textAlign = "center";
  for (let l = 0; l < LV; l++) {
    const a = (l + 1) / LV;
    g.fillStyle = l === LV - 1 ? "rgba(255,214,180,.95)" : `rgba(255,${102 + l * 12},${l * 8},${0.18 + a * 0.7})`;
    for (let c = 1; c < RAMP.length; c++) g.fillText(RAMP[c], c * CW + CW / 2, l * CH + CH / 2);
  }
  const cols = Math.ceil(env.w / CW);
  const rows = Math.ceil(env.h / CH);
  const edge = edgeFactor(env, 0.35);
  const calm = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) calm[j * cols + i] = edge(i * CW, j * CH);
  let sx = 0;
  let sy = 0;
  const sw = CW * env.dpr;
  const sh = CH * env.dpr;
  let wait = 0;
  return (ctx, e, t, dt) => {
    // 15 fps on purpose: a terminal-like rhythm, and a quarter of the work
    wait -= dt;
    if (wait > 0 && !e.still) return;
    wait = 1 / 15;
    ctx.clearRect(0, 0, e.w, e.h);
    if (e.pointer) {
      sx += (e.px - sx) * 0.08;
      sy += (e.py - sy) * 0.08;
    }
    for (let j = 0; j < rows; j++) {
      const y = j * CH;
      for (let i = 0; i < cols; i++) {
        const x = i * CW;
        // domain-warped waves: the warp makes the bands curl instead of sliding straight
        const wx = x * 0.006 + Math.sin(y * 0.009 + t * 0.3) * 1.2;
        const wy = y * 0.008 + Math.cos(x * 0.007 - t * 0.25) * 1.2;
        let v = (Math.sin(wx * 2.1 + t * 0.5) + Math.sin(wy * 1.7 - t * 0.4) + Math.sin((wx + wy) * 1.3)) / 3;
        if (e.pointer) {
          const d = Math.hypot(x - sx, y - sy);
          if (d < 200) v += Math.sin(d * 0.06 - t * 4) * (1 - d / 200) * 0.6;
        }
        v = ((v + 1) / 2) ** 2.2 * calm[j * cols + i] * 1.25;
        if (v < 0.09) continue;
        const c = Math.min(RAMP.length - 1, 1 + Math.floor(v * (RAMP.length - 1)));
        const l = Math.min(LV - 1, Math.floor(v * LV));
        ctx.drawImage(atlas, c * sw, l * sh, sw, sh, x, y, CW, CH);
      }
    }
  };
};

/* ---------------------------------------------------------------- reaction: Gray–Scott reaction–diffusion */

export const reaction: Draw = (env) => {
  const CELL = env.w < 700 ? 5 : 6;
  const W = Math.ceil(env.w / CELL);
  const H = Math.ceil(env.h / CELL);
  let A = new Float32Array(W * H).fill(1);
  let B = new Float32Array(W * H);
  let A2 = new Float32Array(W * H);
  let B2 = new Float32Array(W * H);
  const seed = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const i = (((cy + y + H) % H) * W + ((cx + x + W) % W)) | 0;
        B[i] = 1;
        A[i] = 0.5;
      }
  };
  for (let s = 0; s < (W * H) / 700; s++) seed((Math.random() * W) | 0, (Math.random() * H) | 0, 3 + ((Math.random() * 2) | 0));
  // feed/kill drift across the screen: spots on one side, worm-like mazes on the other
  const F = new Float32Array(W);
  const K = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    F[x] = 0.035 + u * 0.02;
    K[x] = 0.064 - u * 0.002;
  }
  const step = () => {
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W;
      const y0 = y * W;
      const yp = ((y + 1) % H) * W;
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W;
        const xp = (x + 1) % W;
        const i = y0 + x;
        const a = A[i];
        const b = B[i];
        const la = (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) * 0.2 + (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]) * 0.05 - a;
        const lb = (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) * 0.2 + (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]) * 0.05 - b;
        const abb = a * b * b;
        A2[i] = a + (la - abb + F[x] * (1 - a));
        B2[i] = b + (0.5 * lb + abb - (K[x] + F[x]) * b);
      }
    }
    [A, A2] = [A2, A];
    [B, B2] = [B2, B];
  };
  for (let i = 0; i < (env.still ? 1500 : 400); i++) step();
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const og = off.getContext("2d")!;
  const img = og.createImageData(W, H);
  const edge = edgeFactor(env, 0.15);
  const calm = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) calm[y * W + x] = edge(x * CELL, y * CELL);
  let acc = 0;
  return (ctx, e, _t, dt) => {
    if (e.pointer) seed((e.px / CELL) | 0, (e.py / CELL) | 0, 2);
    acc += dt;
    // a few steps per frame — the pattern grows visibly but slowly
    for (let n = Math.min(12, Math.round(acc * 300)); n > 0; n--) step();
    acc = 0;
    const d = img.data;
    for (let i = 0; i < W * H; i++) {
      const v = Math.min(1, Math.max(0, (B[i] - 0.08) * 3.2)) * calm[i];
      const hot = v > 0.75 ? (v - 0.75) * 4 : 0;
      d[i * 4] = ORANGE[0];
      d[i * 4 + 1] = ORANGE[1] + hot * 90;
      d[i * 4 + 2] = hot * 60;
      d[i * 4 + 3] = v * 75;
    }
    og.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, e.w, e.h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W * CELL, H * CELL);
  };
};

/* ---------------------------------------------------------------- dither: 1-bit retro monitor, ordered (Bayer) dither */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export const dither: Draw = (env) => {
  const P = 4; // one «monitor pixel» = 4 css px
  const W = Math.ceil(env.w / P);
  const H = Math.ceil(env.h / P);
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const og = off.getContext("2d")!;
  const img = og.createImageData(W, H);
  const colX = new Float32Array(W);
  const rowY = new Float32Array(H);
  const diag = new Float32Array(W + H);
  const edge = edgeFactor(env, 0.15);
  const calm = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) calm[y * W + x] = edge(x * P, y * P);
  let gx = env.w * 0.7;
  let gy = env.h * 0.3;
  return (ctx, e, t) => {
    // separable terms: one sin per column/row/diagonal instead of three per pixel
    for (let x = 0; x < W; x++) colX[x] = Math.sin(x * 0.045 + t * 0.4);
    for (let y = 0; y < H; y++) rowY[y] = Math.sin(y * 0.06 - t * 0.33);
    for (let k = 0; k < W + H; k++) diag[k] = Math.sin(k * 0.025 + t * 0.21);
    const tx = e.pointer ? e.px : env.w * (0.5 + 0.35 * Math.sin(t * 0.21));
    const ty = e.pointer ? e.py : env.h * (0.45 + 0.3 * Math.sin(t * 0.17 + 1));
    gx += (tx - gx) * 0.06;
    gy += (ty - gy) * 0.06;
    const bx = gx / P;
    const by = gy / P;
    const R = 46;
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let v = ((colX[x] + rowY[y] + diag[x + y]) / 3 + 1) / 2;
        v = Math.max(0, (v - 0.4) / 0.6) ** 1.6 * 0.6;
        const dx = x - bx;
        const dy = y - by;
        const r2 = dx * dx + dy * dy;
        if (r2 < R * R) v += (1 - Math.sqrt(r2) / R) ** 2 * 0.9;
        v *= calm[i];
        const th = BAYER[(y & 3) * 4 + (x & 3)];
        // three tones: background / deep orange / orange, dithered between
        const q = v * 2;
        const lvl = Math.floor(q) + (q % 1 > th ? 1 : 0);
        const o = i * 4;
        if (lvl <= 0) d[o + 3] = 0;
        else if (lvl === 1) {
          d[o] = 120;
          d[o + 1] = 44;
          d[o + 2] = 6;
          d[o + 3] = 170;
        } else {
          d[o] = ORANGE[0];
          d[o + 1] = ORANGE[1] + 30;
          d[o + 2] = 20;
          d[o + 3] = 220;
        }
      }
    }
    og.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, e.w, e.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W * P, H * P);
  };
};

/* ---------------------------------------------------------------- sensor: the grid remembers where the «mouse» went */

export const sensor: Draw = (env) => {
  const C = 22;
  const cols = Math.ceil(env.w / C);
  const rows = Math.ceil(env.h / C);
  const heat = new Float32Array(cols * rows);
  let px = -1;
  let py = -1;
  let idle = 0;
  const LV = 10;
  const buckets: number[][] = Array.from({ length: LV }, () => []);
  const stamp = (x: number, y: number, s: number) => {
    const ci = Math.floor(x / C);
    const cj = Math.floor(y / C);
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const f = i === ci && j === cj ? 1 : 0.35;
        heat[j * cols + i] = Math.min(1.2, heat[j * cols + i] + f * s);
      }
  };
  return (ctx, e, t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    // no mouse (phones, or the cursor is still): a ghost «mouse» draws a flick path by itself
    idle = e.pointer ? 0 : idle + dt;
    const ghost = idle > 1.2;
    const x = ghost ? e.w * (0.5 + 0.42 * Math.sin(t * 0.53) * Math.cos(t * 0.21)) : e.px;
    const y = ghost ? e.h * (0.5 + 0.4 * Math.sin(t * 0.37 + 2)) : e.py;
    if (ghost || e.pointer) {
      if (px < 0) [px, py] = [x, y];
      const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / (C / 2)));
      for (let k = 1; k <= n; k++) stamp(px + ((x - px) * k) / n, py + ((y - py) * k) / n, ghost ? 0.5 : 0.8);
      [px, py] = [x, y];
    } else px = -1;
    const decay = Math.exp(-dt * 1.1);
    for (const b of buckets) b.length = 0;
    for (let i = 0; i < heat.length; i++) {
      if (heat[i] < 0.02) continue;
      heat[i] *= decay;
      buckets[Math.min(LV - 1, Math.floor(Math.min(1, heat[i]) * LV))].push(i);
    }
    for (let b = 0; b < LV; b++) {
      if (!buckets[b].length) continue;
      const a = (b + 1) / LV;
      // hot cells are pale gold, cooling ones deep orange — like a heat map of the sensor
      ctx.fillStyle = a > 0.8 ? `rgba(255,200,150,${a * 0.75})` : `rgba(255,${80 + a * 60},0,${a * 0.5})`;
      ctx.beginPath();
      for (const i of buckets[b]) ctx.rect((i % cols) * C + 2, Math.floor(i / cols) * C + 2, C - 3, C - 3);
      ctx.fill();
    }
  };
};

/* ---------------------------------------------------------------- lines: stacked sound-wave ridges (the «Unknown Pleasures» look) */

export const lines: Draw = (env) => {
  const N = env.w < 700 ? 22 : 34;
  const STEP = 8;
  const top = env.h * 0.18;
  const gap = (env.h * 0.86 - top) / N;
  const seeds = Array.from({ length: N }, () => Math.random() * 100);
  let mx = env.w * 0.72;
  let my = env.h * 0.5;
  const edge = edgeFactor(env, 0.35);
  return (ctx, e, t) => {
    ctx.clearRect(0, 0, e.w, e.h);
    if (e.pointer) {
      mx += (e.px - mx) * 0.08;
      my += (e.py - my) * 0.08;
    }
    for (let l = 0; l < N; l++) {
      const base = top + l * gap;
      const s = seeds[l];
      const ridge = new Path2D();
      ridge.moveTo(-10, base);
      for (let x = -10; x <= e.w + 10; x += STEP) {
        const u = x / e.w;
        // the peaks live in a band on the right and a smaller one on the left — away from the hero copy
        const env1 = Math.exp(-(((u - 0.74) / 0.12) ** 2)) + 0.55 * Math.exp(-(((u - 0.12) / 0.08) ** 2));
        let a = Math.abs(Math.sin(x * 0.021 + s + t * 0.9) * Math.sin(x * 0.009 - s * 1.7 + t * 0.6) + 0.5 * Math.sin(x * 0.047 + s * 3 - t * 1.4));
        a = a * env1 * gap * 3.2 + Math.sin(x * 0.05 + s) * 1.2;
        const d = Math.hypot(x - mx, base - my);
        if (e.pointer && d < 180) a += (1 - d / 180) ** 2 * gap * 3 * (0.6 + 0.4 * Math.sin(x * 0.08 - t * 6));
        ridge.lineTo(x, base - Math.max(0, a));
      }
      // fill below with the page colour so nearer ridges hide the ones behind
      const body = new Path2D(ridge);
      body.lineTo(e.w + 10, base + gap * 2);
      body.lineTo(-10, base + gap * 2);
      body.closePath();
      ctx.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
      ctx.fill(body);
      const k = l / N;
      ctx.strokeStyle = `rgba(255,${102 + k * 50},${k * 40},${(0.25 + k * 0.5) * edge(e.w * 0.74, base)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke(ridge);
    }
  };
};
