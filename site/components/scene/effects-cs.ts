/**
 * Third batch of canvas backgrounds (SceneFx): the shop's own world — CS2 (radar, spray pattern,
 * case roulette, aim trainer), the brand's chamfered HUD brackets and the gear itself (Hall-effect
 * switches). No weapons or third-party marks are drawn: only dots, rings, brackets and our icons.
 */
import { displayFont, edgeFactor, type Draw, type Env } from "./fx-types";

/** A random point where the effect may be loud: away from the hero copy in the middle. */
function edgePoint(env: Env, min = 0.75) {
  const edge = edgeFactor(env, 0);
  for (let i = 0; i < 40; i++) {
    const x = 30 + Math.random() * (env.w - 60);
    const y = 90 + Math.random() * (env.h - 140);
    if (edge(x, y) >= min) return { x, y };
  }
  return { x: env.w * 0.9, y: env.h * 0.8 };
}

const ease = (p: number) => 1 - (1 - p) ** 3;

/* ---------------------------------------------------------------- radar: a CS-style minimap sweep */

export const radar: Draw = (env) => {
  const cx = env.w * (env.w < 700 ? 0.5 : 0.7);
  const cy = env.h * 0.58;
  const R = Math.hypot(Math.max(cx, env.w - cx), Math.max(cy, env.h - cy));
  // a procedural «map»: blocks snapped to a 24 px grid, outlined like a radar overview
  const blocks: [number, number, number, number][] = [];
  for (let i = 0; i < Math.round((env.w * env.h) / 26000); i++) {
    const s = 24;
    blocks.push([
      Math.round((Math.random() * env.w) / s) * s,
      Math.round((Math.random() * env.h) / s) * s,
      (2 + ((Math.random() * 7) | 0)) * s,
      (2 + ((Math.random() * 5) | 0)) * s,
    ]);
  }
  type Blip = { x: number; y: number; vx: number; vy: number; lit: number };
  const blips: Blip[] = Array.from({ length: 9 }, () => {
    const p = edgePoint(env, 0.4);
    return { ...p, vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18, lit: 0 };
  });
  const map = document.createElement("canvas");
  map.width = Math.round(env.w * env.dpr);
  map.height = Math.round(env.h * env.dpr);
  const mg = map.getContext("2d")!;
  mg.scale(env.dpr, env.dpr);
  mg.fillStyle = "rgba(255,255,255,.012)";
  mg.strokeStyle = "rgba(255,255,255,.045)";
  for (const [x, y, w, h] of blocks) {
    mg.fillRect(x, y, w, h);
    mg.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  mg.strokeStyle = "rgba(255,102,0,.07)";
  for (let r = 140; r < R; r += 140) {
    mg.beginPath();
    mg.arc(cx, cy, r, 0, Math.PI * 2);
    mg.stroke();
  }
  mg.beginPath();
  mg.moveTo(cx - R, cy);
  mg.lineTo(cx + R, cy);
  mg.moveTo(cx, cy - R);
  mg.lineTo(cx, cy + R);
  mg.stroke();
  const WEDGE = 0.7;
  let pings: { x: number; y: number; age: number }[] = [];
  let still = 0;
  let lpx = 0;
  let lpy = 0;
  return (ctx, e, t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    ctx.drawImage(map, 0, 0, e.w, e.h);
    const a = (t * 0.8) % (Math.PI * 2);
    const g = ctx.createConicGradient(a - WEDGE, cx, cy);
    const k = WEDGE / (Math.PI * 2);
    g.addColorStop(0, "rgba(255,102,0,0)");
    g.addColorStop(k * 0.98, "rgba(255,102,0,.13)");
    g.addColorStop(k, "rgba(255,133,51,.35)");
    g.addColorStop(k * 1.01, "rgba(255,102,0,0)");
    g.addColorStop(1, "rgba(255,102,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, e.w, e.h);
    for (const b of blips) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0 || b.x > e.w) b.vx *= -1;
      if (b.y < 60 || b.y > e.h) b.vy *= -1;
      const ang = (Math.atan2(b.y - cy, b.x - cx) + Math.PI * 2) % (Math.PI * 2);
      const diff = (a - ang + Math.PI * 2) % (Math.PI * 2);
      if (diff < 0.05) b.lit = 1;
      b.lit *= Math.exp(-dt * 0.9);
      if (b.lit < 0.03) continue;
      ctx.fillStyle = `rgba(255,133,51,${b.lit})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,102,0,${b.lit * 0.5})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4 + (1 - b.lit) * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    // a «ping» where the cursor rests
    if (e.pointer) {
      still = Math.hypot(e.px - lpx, e.py - lpy) < 2 ? still + dt : 0;
      [lpx, lpy] = [e.px, e.py];
      if (still > 0.7) {
        pings.push({ x: e.px, y: e.py, age: 0 });
        still = -2;
      }
    }
    pings = pings.filter((p) => (p.age += dt) < 2.4);
    for (const p of pings) {
      const q = p.age / 2.4;
      ctx.strokeStyle = `rgba(255,170,90,${1 - q})`;
      ctx.lineWidth = 1.5;
      for (const d of [0, 0.35]) {
        const qq = (q + d) % 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + qq * 34, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
  };
};

/* ---------------------------------------------------------------- spray: a recoil pattern of impacts + a crosshair */

// a classic «7»-shaped rifle pattern: climbs, then sways right and left (px, y up = negative)
const PATTERN = [
  [0, 0], [-1, -9], [1, -19], [0, -30], [2, -42], [3, -54], [1, -64], [-2, -72], [-1, -78], [3, -82],
  [10, -84], [18, -85], [24, -83], [26, -86], [20, -88], [10, -89], [0, -90], [-10, -89], [-20, -90], [-26, -92],
  [-28, -94], [-24, -95], [-16, -96], [-8, -95], [2, -96], [12, -98], [18, -99], [14, -100], [6, -101], [0, -102],
];

export const spray: Draw = (env) => {
  type Hole = { x: number; y: number; age: number };
  let holes: Hole[] = [];
  let sx = 0;
  let sy = 0;
  let shot = 99;
  let wait = 0.6;
  let shotT = 0;
  let gap = 4;
  const S = env.w < 700 ? 1.1 : 1.6;
  let cxh = env.w * 0.8;
  let cyh = env.h * 0.6;
  return (ctx, e, _t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    // start a new spray every few seconds at a free spot near the edges
    if (shot >= PATTERN.length) {
      wait -= dt;
      if (wait <= 0) {
        const p = edgePoint(e, 0.8);
        sx = p.x;
        sy = p.y + 80 * S;
        shot = 0;
        shotT = 0;
        wait = 2.5 + Math.random() * 2;
      }
    } else {
      shotT += dt;
      while (shot < PATTERN.length && shotT >= 0.1) {
        shotT -= 0.1;
        const [ox, oy] = PATTERN[shot];
        holes.push({ x: sx + ox * S + (Math.random() - 0.5) * 3, y: sy + oy * S + (Math.random() - 0.5) * 3, age: 0 });
        shot++;
        gap = 14;
      }
    }
    holes = holes.filter((h) => (h.age += dt) < 7);
    for (const h of holes) {
      const hot = Math.max(0, 1 - h.age / 0.5);
      const fade = Math.min(1, (7 - h.age) / 2);
      // impact: a dark core, a hot orange rim cooling to grey, a spark on the first frames
      ctx.fillStyle = `rgba(0,0,0,${0.7 * fade})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hot > 0 ? `rgba(255,${120 + hot * 100},${hot * 120},${fade})` : `rgba(160,160,170,${0.35 * fade})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 4.6, 0, Math.PI * 2);
      ctx.stroke();
      if (hot > 0) {
        ctx.fillStyle = `rgba(255,220,180,${hot})`;
        for (let k = 0; k < 4; k++) ctx.fillRect(h.x + (Math.random() - 0.5) * 18 * (1 - hot), h.y + (Math.random() - 0.5) * 18 * (1 - hot), 2, 2);
      }
    }
    // crosshair: follows the mouse; on phones it rests near the spray
    const tx = e.pointer ? e.px : shot < PATTERN.length ? sx : cxh;
    const ty = e.pointer ? e.py : shot < PATTERN.length ? sy - 40 * S : cyh;
    cxh += (tx - cxh) * 0.2;
    cyh += (ty - cyh) * 0.2;
    gap += (4 - gap) * Math.min(1, dt * 8);
    ctx.strokeStyle = "rgba(255,133,51,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cxh + dx * gap, cyh + dy * gap);
      ctx.lineTo(cxh + dx * (gap + 8), cyh + dy * (gap + 8));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  };
};

/* ---------------------------------------------------------------- roulette: the case-opening strip with our item icons */

const ICONS = ["mouse", "keycaps", "headset", "mousepad", "mechanical", "magnetic", "glides", "cable", "glass", "sleeve"];
const RARITY = [
  { c: "138,138,146", w: 0.5 }, // common
  { c: "205,127,50", w: 0.28 }, // bronze
  { c: "200,210,224", w: 0.15 }, // silver
  { c: "255,179,0", w: 0.06 }, // gold
  { c: "255,102,0", w: 0.01 }, // ChiSetup orange
];
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const roulette: Draw = (env) => {
  const imgs = ICONS.map((n) => {
    const im = new Image();
    im.src = `/mascot/icons/${n}.webp`;
    return im;
  });
  const small = env.w < 700;
  const CW = small ? 92 : 128;
  const CH = small ? 78 : 104;
  const PITCH = CW + 8;
  const y0 = env.h - CH - (small ? 70 : 28);
  let off = Math.random() * 1e4;
  let from = off;
  let dist = 4000;
  let ct = 0;
  const SPIN = 6.5;
  const HOLD = 2.2;
  const rarityOf = (i: number) => {
    let r = hash(i);
    for (let k = 0; k < RARITY.length; k++) {
      if (r < RARITY[k].w) return k;
      r -= RARITY[k].w;
    }
    return 0;
  };
  const chamfer = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number) => {
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  };
  return (ctx, e, _t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    ct += dt;
    if (ct > SPIN + HOLD) {
      ct = 0;
      from = off;
      dist = 3000 + Math.random() * 2500;
    }
    const p = Math.min(1, ct / SPIN);
    off = from + dist * ease(p);
    const landed = ct > SPIN;
    const mid = e.w / 2;
    const first = Math.floor((off - mid) / PITCH) - 1;
    const n = Math.ceil(e.w / PITCH) + 3;
    for (let k = 0; k < n; k++) {
      const i = first + k;
      const x = i * PITCH - off + mid - CW / 2;
      const center = Math.abs(x + CW / 2 - mid) < PITCH / 2;
      const r = RARITY[rarityOf(i)];
      const win = landed && center;
      const pulse = win ? 0.6 + 0.4 * Math.sin((ct - SPIN) * 8) : 0;
      ctx.globalAlpha = win ? 0.8 : 0.3;
      chamfer(ctx, x, y0, CW, CH, 10);
      const grd = ctx.createLinearGradient(0, y0, 0, y0 + CH);
      grd.addColorStop(0, "rgba(26,26,26,.9)");
      grd.addColorStop(1, `rgba(${r.c},${0.18 + pulse * 0.3})`);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = `rgba(${r.c},${win ? 0.9 : 0.35})`;
      ctx.stroke();
      ctx.fillStyle = `rgba(${r.c},.95)`;
      ctx.fillRect(x + 10, y0 + CH - 4, CW - 20, 3);
      const im = imgs[Math.floor(hash(i + 0.5) * imgs.length)];
      if (im.complete && im.naturalWidth) {
        const s = CH * 0.68;
        ctx.drawImage(im, x + (CW - s) / 2, y0 + 6, s, s);
      }
    }
    ctx.globalAlpha = 1;
    // fade the strip out towards both screen edges
    ctx.globalCompositeOperation = "destination-out";
    const fade = ctx.createLinearGradient(0, 0, e.w, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.28, "rgba(0,0,0,0)");
    fade.addColorStop(0.72, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, y0 - 10, e.w, CH + 20);
    ctx.globalCompositeOperation = "source-over";
    // the marker
    ctx.fillStyle = "rgba(255,133,51,.9)";
    ctx.fillRect(mid - 1, y0 - 12, 2, CH + 24);
    ctx.beginPath();
    ctx.moveTo(mid - 6, y0 - 12);
    ctx.lineTo(mid + 6, y0 - 12);
    ctx.lineTo(mid, y0 - 4);
    ctx.fill();
  };
};

/* ---------------------------------------------------------------- lockon: the logo's chamfered brackets lock onto gear specs */

const SPECS = ["26K DPI", "8000 HZ", "RT 0.1 MM", "650 IPS", "54 G", "0.1 MS", "PTFE", "HALL EFFECT", "40 G·F", "TKL 87"];

function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number) {
  const L = Math.min(w, h) * 0.32;
  const c = Math.min(8, L * 0.4);
  // like the logo frame: top-left / bottom-right white, the other two orange
  const corners: [number, number, number, number, boolean][] = [
    [x, y, 1, 1, false],
    [x + w, y, -1, 1, true],
    [x, y + h, 1, -1, true],
    [x + w, y + h, -1, -1, false],
  ];
  ctx.lineWidth = 2;
  for (const [px, py, sx, sy, orange] of corners) {
    ctx.strokeStyle = orange ? `rgba(255,102,0,${a})` : `rgba(255,255,255,${a * 0.85})`;
    ctx.beginPath();
    ctx.moveTo(px + sx * L, py);
    ctx.lineTo(px + sx * c, py);
    ctx.lineTo(px, py + sy * c);
    ctx.lineTo(px, py + sy * L);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}

export const lockon: Draw = (env) => {
  type L = { x: number; y: number; age: number; life: number; label: string };
  let locks: L[] = [];
  let next = 0.3;
  let fx = env.w / 2;
  let fy = env.h / 2;
  let fs = 60;
  let lpx = 0;
  let lpy = 0;
  const font = displayFont(600, 11);
  return (ctx, e, _t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    next -= dt;
    if (next <= 0 && locks.length < 4) {
      const p = edgePoint(e, 0.88);
      locks.push({ ...p, age: 0, life: 2.6 + Math.random(), label: SPECS[(Math.random() * SPECS.length) | 0] });
      next = 0.7 + Math.random() * 0.9;
    }
    locks = locks.filter((l) => (l.age += dt) < l.life);
    ctx.font = font;
    ctx.textBaseline = "middle";
    for (const l of locks) {
      const p = Math.min(1, l.age / 0.45);
      const s = 150 - 104 * ease(p);
      const a = Math.min(1, l.age / 0.15) * Math.min(1, (l.life - l.age) / 0.5);
      brackets(ctx, l.x - s / 2, l.y - s / 2, s, s, a * 0.8);
      if (p >= 1) {
        ctx.fillStyle = `rgba(255,102,0,${a})`;
        ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
        // a leader line and the readout, typed in
        const chars = Math.min(l.label.length, Math.floor((l.age - 0.45) * 30));
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(l.x + s / 2, l.y - s / 2);
        ctx.lineTo(l.x + s / 2 + 14, l.y - s / 2 - 14);
        ctx.lineTo(l.x + s / 2 + 22 + chars * 7.5, l.y - s / 2 - 14);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
        ctx.fillText(l.label.slice(0, chars), l.x + s / 2 + 18, l.y - s / 2 - 22);
      }
    }
    // the cursor is tracked too: a bracket that tightens when the mouse stops
    if (e.pointer) {
      const v = Math.hypot(e.px - lpx, e.py - lpy) / Math.max(dt, 0.001);
      [lpx, lpy] = [e.px, e.py];
      fx += (e.px - fx) * 0.25;
      fy += (e.py - fy) * 0.25;
      fs += (Math.min(110, 34 + v * 0.06) - fs) * 0.15;
      brackets(ctx, fx - fs / 2, fy - fs / 2, fs, fs, 0.55);
    }
  };
};

/* ---------------------------------------------------------------- aim: an aim-trainer round — flicks, hits, shards */

export const aim: Draw = (env) => {
  type T = { x: number; y: number; r: number; age: number };
  type Shard = { x: number; y: number; vx: number; vy: number; age: number };
  let targets: T[] = [];
  let shards: Shard[] = [];
  let rings: { x: number; y: number; age: number }[] = [];
  let cx = env.w * 0.8;
  let cy = env.h * 0.5;
  let fromX = cx;
  let fromY = cy;
  let flick = -1;
  let flickDur = 0.25;
  let aimAt: T | null = null;
  let pause = 0.4;
  const trail: [number, number][] = [];
  const pop = (t: T) => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.random() * 0.4;
      const v = 60 + Math.random() * 90;
      shards.push({ x: t.x, y: t.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0 });
    }
    rings.push({ x: t.x, y: t.y, age: 0 });
    targets = targets.filter((q) => q !== t);
  };
  return (ctx, e, _t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    while (targets.length < 3) targets.push({ ...edgePoint(e, 0.65), r: 12 + Math.random() * 8, age: 0 });
    for (const t of targets) t.age += dt;
    // the «player»: flick to a target with a slight overshoot, micro-correct, click
    if (flick < 0) {
      pause -= dt;
      if (pause <= 0) {
        aimAt = targets[(Math.random() * targets.length) | 0];
        fromX = cx;
        fromY = cy;
        flick = 0;
        flickDur = 0.18 + Math.min(0.2, Math.hypot(aimAt.x - cx, aimAt.y - cy) / 4000);
      }
    } else if (aimAt) {
      flick += dt / flickDur;
      const p = Math.min(1, flick);
      const over = 1 + Math.sin(p * Math.PI) * 0.06;
      cx = fromX + (aimAt.x - fromX) * ease(p) * (p < 1 ? over : 1);
      cy = fromY + (aimAt.y - fromY) * ease(p) * (p < 1 ? over : 1);
      if (flick >= 1.35) {
        pop(aimAt);
        aimAt = null;
        flick = -1;
        pause = 0.25 + Math.random() * 0.5;
      }
    }
    trail.push([cx, cy]);
    if (trail.length > 14) trail.shift();
    // the visitor can shoot too: hovering a target pops it
    if (e.pointer) for (const t of [...targets]) if (t !== aimAt && Math.hypot(t.x - e.px, t.y - e.py) < t.r + 4) pop(t);
    for (const t of targets) {
      const s = Math.min(1, t.age / 0.25);
      ctx.fillStyle = "rgba(255,102,0,.22)";
      ctx.strokeStyle = "rgba(255,133,51,.8)";
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,210,170,.9)";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    shards = shards.filter((s) => (s.age += dt) < 0.7);
    for (const s of shards) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.92;
      s.vy *= 0.92;
      ctx.fillStyle = `rgba(255,170,90,${1 - s.age / 0.7})`;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    rings = rings.filter((r) => (r.age += dt) < 0.5);
    for (const r of rings) {
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - r.age / 0.5)})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 10 + r.age * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = `rgba(255,133,51,${(i / trail.length) * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
      ctx.lineTo(trail[i][0], trail[i][1]);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cx + dx * 4, cy + dy * 4);
      ctx.lineTo(cx + dx * 11, cy + dy * 11);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  };
};

/* ---------------------------------------------------------------- hall: magnetic switches — key travel and actuation points */

export const hall: Draw = (env) => {
  const small = env.w < 700;
  const COL = small ? 22 : 30;
  const n = Math.floor((env.w - 24) / COL);
  const font = displayFont(600, 9);
  const H = env.h * (small ? 0.22 : 0.3);
  const top = env.h - H - 16;
  const keys = Array.from({ length: n }, () => ({ d: 0, target: 0, act: 0.1 + Math.random() * 0.45, hit: 0 }));
  let press = 0;
  return (ctx, e, t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    // someone is playing: random keys pressed hard and released fast (rapid trigger)
    press -= dt;
    if (press <= 0) {
      const k = keys[(Math.random() * n) | 0];
      k.target = 0.5 + Math.random() * 0.5;
      press = 0.05 + Math.random() * 0.1;
    }
    for (let i = 0; i < n; i++) {
      const k = keys[i];
      const x = 20 + i * COL + (env.w - 24 - n * COL) / 2;
      let target = k.target + Math.max(0, Math.sin(i * 0.25 - t * 1.6)) ** 8 * 0.35;
      if (e.pointer && e.py > top - 120) target = Math.max(target, Math.max(0, 1 - Math.abs(e.px - x) / 90) * 0.95);
      k.d += (target - k.d) * Math.min(1, dt * 18);
      k.target *= Math.exp(-dt * 7);
      const wasOn = k.hit > 0.5;
      const on = k.d > k.act;
      if (on && !wasOn) k.hit = 1;
      else if (!on) k.hit *= Math.exp(-dt * 6);
      const w = COL - 10;
      ctx.strokeStyle = "rgba(255,255,255,.06)";
      ctx.strokeRect(x + 0.5, top + 0.5, w, H);
      ctx.fillStyle = on ? "rgba(255,133,51,.55)" : "rgba(255,102,0,.18)";
      ctx.fillRect(x + 2, top + 2, w - 3, (H - 3) * k.d);
      // the actuation point of this key
      const ay = top + H * k.act;
      ctx.fillStyle = on ? "rgba(255,230,200,.9)" : "rgba(255,255,255,.25)";
      ctx.fillRect(x - 2, ay, w + 5, 1);
      if (k.hit > 0.05) {
        ctx.fillStyle = `rgba(255,170,90,${k.hit * 0.8})`;
        ctx.fillRect(x + w / 2 - 1.5, top - 8, 3, 3);
      }
    }
    // the travel scale on the left
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.font = font;
    for (let mm = 0; mm <= 4; mm++) ctx.fillText(`${mm}`, 2, top + (H * mm) / 4 + 3);
  };
};
