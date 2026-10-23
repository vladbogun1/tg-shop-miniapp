"use client";

/**
 * Page background ("scene") with optional motion layers — a design experiment: the owner compares
 * the variants on the live home page and picks one. The variant comes from `?bg=<id>` (remembered
 * in localStorage); the switcher panel shows in dev builds or when `?bg` is in the URL.
 *
 * Performance rules (iOS lesson, see globals.css .scene): CSS variants animate only transform /
 * opacity of pre-drawn layers; canvas variants render at DPR ≤ 1.5 (the smoke shader at ~1/3 size),
 * cap at 30 fps on touch devices, stop while the tab is hidden and draw a single still frame with
 * prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from "react";
import { aim, hall, lockon, radar, roulette, spray } from "./effects-cs";
import { ascii, dither, keys, lines, reaction, sensor } from "./effects-more";
import type { Draw, Env, Frame } from "./fx-types";
import { CHLADNI, CSSMOKE, HONEY, PAD, SMOKE, TOPO } from "./shaders";
import "./scene-fx.css";

export const FX = [
  { id: "off", label: "Как сейчас" },
  { id: "aurora", label: "Аврора", group: "Атмосфера" },
  { id: "streaks", label: "Неон-трассы" },
  { id: "embers", label: "Искры" },
  { id: "circuit", label: "Схема" },
  { id: "pixels", label: "Пиксели" },
  { id: "smoke", label: "Дым" },
  { id: "keys", label: "Клавиатура", group: "Генеративные" },
  { id: "sensor", label: "Сенсор" },
  { id: "lines", label: "Звук" },
  { id: "ascii", label: "ASCII" },
  { id: "dither", label: "Дизер" },
  { id: "reaction", label: "Кораллы" },
  { id: "topo", label: "Топокарта" },
  { id: "chladni", label: "Хладни" },
  { id: "lockon", label: "Скобки-захват", group: "Бренд, CS2, девайсы" },
  { id: "roulette", label: "Рулетка кейса" },
  { id: "radar", label: "Радар" },
  { id: "cssmoke", label: "Смок CS2" },
  { id: "spray", label: "Спрей" },
  { id: "aim", label: "Аим-тренер" },
  { id: "hall", label: "Магнитные свитчи" },
  { id: "pad", label: "Коврик" },
  { id: "honey", label: "Соты" },
] as const;
export type FxId = (typeof FX)[number]["id"];
type FxItem = (typeof FX)[number];
const GROUPS = FX.reduce<{ name: string; items: FxItem[] }[]>((acc, f) => {
  if ("group" in f || !acc.length) acc.push({ name: "group" in f ? f.group : "Сейчас", items: [] });
  acc[acc.length - 1].items.push(f);
  return acc;
}, []);

const KEY = "bgfx";
const isFx = (v: string | null): v is FxId => !!v && FX.some((f) => f.id === v);

export function SceneFx() {
  const [fx, setFx] = useState<FxId>("off");
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("bg");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* private mode */
    }
    setFx(isFx(q) ? q : isFx(saved) ? saved : "off");
    setPanel(process.env.NODE_ENV !== "production" || q !== null);
  }, []);

  const choose = (id: FxId) => {
    setFx(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("bg", id);
    window.history.replaceState(window.history.state, "", url);
  };

  const shift = (d: number) => choose(FX[(FX.findIndex((f) => f.id === fx) + d + FX.length) % FX.length].id);
  // [ and ] flip through the variants
  useEffect(() => {
    if (!panel) return;
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "[" || e.key === "]") shift(e.key === "]" ? 1 : -1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return (
    <>
      <div className="scene" data-fx={fx} aria-hidden>
        {fx === "aurora" && <Aurora />}
        {fx === "streaks" && <Streaks />}
        {fx === "embers" && <CanvasFx draw={embers} />}
        {fx === "circuit" && <CanvasFx draw={circuit} />}
        {fx === "pixels" && <CanvasFx draw={pixels} />}
        {fx === "smoke" && <Shader frag={SMOKE} scale={0.34} />}
        {fx === "keys" && <CanvasFx draw={keys} />}
        {fx === "sensor" && <CanvasFx draw={sensor} />}
        {fx === "lines" && <CanvasFx draw={lines} />}
        {fx === "ascii" && <CanvasFx draw={ascii} />}
        {fx === "dither" && <CanvasFx draw={dither} />}
        {fx === "reaction" && <CanvasFx draw={reaction} />}
        {fx === "topo" && <Shader frag={TOPO} scale={0.6} />}
        {fx === "chladni" && <Shader frag={CHLADNI} scale={0.5} />}
        {fx === "lockon" && <CanvasFx draw={lockon} />}
        {fx === "roulette" && <CanvasFx draw={roulette} />}
        {fx === "radar" && <CanvasFx draw={radar} />}
        {fx === "cssmoke" && <Shader frag={CSSMOKE} scale={0.4} />}
        {fx === "spray" && <CanvasFx draw={spray} />}
        {fx === "aim" && <CanvasFx draw={aim} />}
        {fx === "hall" && <CanvasFx draw={hall} />}
        {fx === "pad" && <Shader frag={PAD} scale={1} />}
        {fx === "honey" && <Shader frag={HONEY} scale={0.75} />}
      </div>
      {panel && (
        <div className="fx-panel" role="group" aria-label="Фон">
          <button type="button" aria-label="Предыдущий фон" onClick={() => shift(-1)}>‹</button>
          <select value={fx} onChange={(e) => choose(e.target.value as FxId)} aria-label="Вариант фона">
            {GROUPS.map((g) => (
              <optgroup key={g.name} label={g.name}>
                {g.items.map((f) => (
                  <option key={f.id} value={f.id}>
                    {FX.indexOf(f)}. {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" aria-label="Следующий фон" onClick={() => shift(1)}>›</button>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- CSS variants */

function Aurora() {
  return (
    <div className="fx-aurora">
      <i className="b1" />
      <i className="b2" />
      <i className="b3" />
      <i className="b4" />
      <span className="grain" />
    </div>
  );
}

function Streaks() {
  return (
    <div className="fx-streaks">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} style={{ "--i": i } as React.CSSProperties} />
      ))}
      <span className="scan" />
    </div>
  );
}

/* ---------------------------------------------------------------- canvas runner */


type Step = (t: number, dt: number) => void;

/** `start` sets the canvas up and returns the frame step plus its own cleanup. */
function useLoop(start: (still: boolean) => [Step, () => void]) {
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const [step, dispose] = start(still);
    if (still) {
      step(8, 0);
      return dispose;
    }
    const minGap = coarse ? 1000 / 31 : 0;
    let raf = 0;
    let last = 0;
    let t = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < minGap) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      t += dt;
      step(t, dt);
    };
    const vis = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", vis);
      dispose();
    };
  }, [start]);
}

function usePointer() {
  const p = useRef({ x: -9999, y: -9999, on: false });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      p.current = { x: e.clientX, y: e.clientY, on: true };
    };
    const out = () => (p.current.on = false);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", out);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", out);
    };
  }, []);
  return p;
}

function CanvasFx({ draw }: { draw: Draw }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pointer = usePointer();
  const [start] = useState(() => (still: boolean): [Step, () => void] => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const env: Env = { w: 0, h: 0, dpr: 1, px: 0, py: 0, pointer: false, scroll: 0, still };
    let frame: Frame = () => {};
    const size = () => {
      env.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      env.w = window.innerWidth;
      env.h = window.innerHeight;
      cv.width = Math.round(env.w * env.dpr);
      cv.height = Math.round(env.h * env.dpr);
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
      frame = draw(env);
    };
    size();
    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(size, 150);
    };
    window.addEventListener("resize", onResize);
    const step: Step = (t, dt) => {
      env.px = pointer.current.x;
      env.py = pointer.current.y;
      env.pointer = pointer.current.on;
      env.scroll = window.scrollY;
      frame(ctx, env, t, dt);
    };
    return [step, () => (window.removeEventListener("resize", onResize), clearTimeout(rt))];
  });
  useLoop(start);
  return <canvas ref={ref} className="fx-canvas" />;
}

/** A soft orange dot, pre-rendered once — drawImage is far cheaper than shadowBlur per particle. */
function glowSprite(rgb: string, size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(255,240,220,1)`);
  grd.addColorStop(0.18, `rgba(${rgb},.9)`);
  grd.addColorStop(0.5, `rgba(${rgb},.18)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/* ---------------------------------------------------------------- embers: sparks rising from the bottom */

const embers: Draw = (env) => {
  const sprite = glowSprite("255,102,0");
  const n = Math.min(170, Math.round((env.w * env.h) / 9000));
  type P = { x: number; y: number; vy: number; r: number; age: number; life: number; seed: number; depth: number };
  const spawn = (fresh: boolean): P => {
    const depth = Math.random();
    return {
      x: Math.random() * env.w,
      y: fresh ? Math.random() * env.h : env.h + 20,
      vy: 18 + depth * 46,
      r: 0.6 + depth * 2.2,
      age: fresh ? Math.random() * 8 : 0,
      life: 7 + Math.random() * 9,
      seed: Math.random() * 100,
      depth,
    };
  };
  const ps = Array.from({ length: n }, () => spawn(true));
  let lastScroll = env.scroll;
  return (ctx, e, t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    ctx.globalCompositeOperation = "lighter";
    const ds = e.scroll - lastScroll;
    lastScroll = e.scroll;
    for (let i = 0; i < ps.length; i++) {
      let p = ps[i];
      p.age += dt;
      p.y -= p.vy * dt + ds * (0.15 + p.depth * 0.35); // nearer sparks scroll faster — depth
      p.x += Math.sin(t * 0.7 + p.seed) * (10 + p.depth * 14) * dt + Math.sin(t * 0.13) * 6 * dt;
      if (e.pointer) {
        const dx = p.x - e.px;
        const dy = p.y - e.py;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22000) {
          const f = (1 - d2 / 22000) * 160 * dt;
          const d = Math.sqrt(d2) || 1;
          p.x += (dx / d) * f;
          p.y += (dy / d) * f;
        }
      }
      if (p.age > p.life || p.y < -30) p = ps[i] = spawn(false);
      const fade = Math.min(1, p.age / 1.2) * Math.min(1, (p.life - p.age) / 2.5);
      const flick = 0.65 + 0.35 * Math.sin(t * (6 + p.seed % 5) + p.seed);
      const s = p.r * 7;
      ctx.globalAlpha = Math.max(0, fade * flick * (0.35 + p.depth * 0.55));
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };
};

/* ---------------------------------------------------------------- circuit: packets running along the HUD grid */

const circuit: Draw = (env) => {
  const G = 48;
  const cols = Math.ceil(env.w / G) + 1;
  const rows = Math.ceil(env.h / G) + 1;
  const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  type K = { cx: number; cy: number; d: number; prog: number; speed: number; trail: [number, number][]; hot: boolean };
  const make = (): K => ({
    cx: Math.floor(Math.random() * cols),
    cy: Math.floor(Math.random() * rows),
    d: Math.floor(Math.random() * 4),
    prog: 0,
    speed: 2 + Math.random() * 4,
    trail: [],
    hot: Math.random() < 0.25,
  });
  const ks = Array.from({ length: Math.max(8, Math.round((cols * rows) / 38)) }, make);
  type F = { x: number; y: number; age: number };
  const flashes: F[] = [];
  // bright copy of the grid for the pointer spotlight
  const R = 220;
  const spot = document.createElement("canvas");
  spot.width = spot.height = R * 2;
  const sg = spot.getContext("2d")!;
  return (ctx, e, t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    // spotlight: grid lines lit around the cursor
    if (e.pointer) {
      sg.globalCompositeOperation = "source-over";
      sg.clearRect(0, 0, R * 2, R * 2);
      sg.strokeStyle = "rgba(255,133,51,.55)";
      sg.lineWidth = 1;
      sg.beginPath();
      const ox = e.px - R;
      const oy = e.py - R;
      for (let x = Math.ceil(ox / G) * G; x < ox + R * 2; x += G) {
        sg.moveTo(x - ox + 0.5, 0);
        sg.lineTo(x - ox + 0.5, R * 2);
      }
      for (let y = Math.ceil(oy / G) * G; y < oy + R * 2; y += G) {
        sg.moveTo(0, y - oy + 0.5);
        sg.lineTo(R * 2, y - oy + 0.5);
      }
      sg.stroke();
      sg.globalCompositeOperation = "destination-in";
      const grd = sg.createRadialGradient(R, R, 0, R, R, R);
      grd.addColorStop(0, "rgba(0,0,0,1)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      sg.fillStyle = grd;
      sg.fillRect(0, 0, R * 2, R * 2);
      ctx.drawImage(spot, ox, oy);
    }
    // packets
    ctx.lineCap = "round";
    for (const k of ks) {
      k.prog += k.speed * dt;
      while (k.prog >= 1) {
        k.prog -= 1;
        k.cx += DIRS[k.d][0];
        k.cy += DIRS[k.d][1];
        const r = Math.random();
        if (r < 0.2) k.d = (k.d + 1) % 4;
        else if (r < 0.4) k.d = (k.d + 3) % 4;
        if (Math.random() < 0.05) flashes.push({ x: k.cx * G, y: k.cy * G, age: 0 });
        if (k.cx < -1 || k.cy < -1 || k.cx > cols + 1 || k.cy > rows + 1) Object.assign(k, make(), { trail: [] });
      }
      const hx = (k.cx + DIRS[k.d][0] * k.prog) * G + 0.5;
      const hy = (k.cy + DIRS[k.d][1] * k.prog) * G + 0.5;
      k.trail.push([hx, hy]);
      if (k.trail.length > 26) k.trail.shift();
      const tr = k.trail;
      for (let i = 1; i < tr.length; i++) {
        const a = i / tr.length;
        ctx.strokeStyle = k.hot ? `rgba(255,170,90,${a * 0.9})` : `rgba(255,102,0,${a * 0.55})`;
        ctx.lineWidth = k.hot ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(tr[i - 1][0], tr[i - 1][1]);
        ctx.lineTo(tr[i][0], tr[i][1]);
        ctx.stroke();
      }
      ctx.fillStyle = k.hot ? "#FFE2C4" : "#FF8533";
      ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
    }
    // node flashes — a small "+" that fades
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.age += dt;
      if (f.age > 1.4) {
        flashes.splice(i, 1);
        continue;
      }
      const a = 1 - f.age / 1.4;
      const s = 4 + f.age * 6;
      ctx.strokeStyle = `rgba(255,133,51,${a * 0.8})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(f.x - s, f.y + 0.5);
      ctx.lineTo(f.x + s, f.y + 0.5);
      ctx.moveTo(f.x + 0.5, f.y - s);
      ctx.lineTo(f.x + 0.5, f.y + s);
      ctx.stroke();
    }
    void t;
  };
};

/* ---------------------------------------------------------------- pixels: a dot matrix with drifting plasma + cursor ripples */

const pixels: Draw = (env) => {
  const S = 14;
  const cols = Math.ceil(env.w / S) + 1;
  const rows = Math.ceil(env.h / S) + 1;
  const ripples: { x: number; y: number; age: number }[] = [];
  let lx = -1e4;
  let ly = -1e4;
  const cx = env.w / 2;
  const cy = env.h * 0.42;
  const maxd = Math.hypot(cx, cy);
  const LV = 12;
  const lv: number[][] = Array.from({ length: LV }, () => []);
  return (ctx, e, t, dt) => {
    ctx.clearRect(0, 0, e.w, e.h);
    if (e.pointer && Math.hypot(e.px - lx, e.py - ly) > 90) {
      ripples.push({ x: e.px, y: e.py, age: 0 });
      lx = e.px;
      ly = e.py;
      if (ripples.length > 6) ripples.shift();
    }
    for (const r of ripples) r.age += dt;
    while (ripples.length && ripples[0].age > 2.2) ripples.shift();
    const oy = (e.scroll * 0.25) % S; // matrix drifts slower than the page — depth
    for (const l of lv) l.length = 0;
    for (let j = 0; j < rows; j++) {
      const y = j * S - oy + S / 2;
      for (let i = 0; i < cols; i++) {
        const x = i * S + S / 2;
        let v =
          Math.sin(x * 0.011 + t * 0.35) +
          Math.sin(y * 0.014 - t * 0.27) +
          Math.sin((x + y) * 0.007 + t * 0.22) +
          Math.sin(Math.hypot(x - e.w * 0.7, y - e.h * 0.3) * 0.012 - t * 0.5);
        v = (v + 4) / 8; // 0..1
        let b = Math.max(0, (v - 0.45) / 0.35);
        for (const r of ripples) {
          const d = Math.hypot(x - r.x, y - r.y) - r.age * 260;
          if (d > -24 && d < 24) b += (1 - Math.abs(d) / 24) * (1 - r.age / 2.2) * 0.9;
        }
        // calmer under the content column, livelier towards the edges
        const a = Math.min(1, b) * 0.85 * (0.45 + 0.55 * Math.min(1, (Math.hypot(x - cx, y - cy) / maxd) * 1.4));
        const k = Math.floor(a * LV);
        if (k > 0) lv[Math.min(LV - 1, k)].push(x, y);
      }
    }
    // one fillStyle per brightness level instead of one per dot
    for (let k = 1; k < LV; k++) {
      const pts = lv[k];
      if (!pts.length) continue;
      const a = k / LV;
      const sz = a > 0.55 ? 3 : 2;
      ctx.fillStyle = a > 0.75 ? `rgba(255,170,90,${a})` : `rgba(255,102,0,${a * 0.9})`;
      for (let q = 0; q < pts.length; q += 2) ctx.fillRect(pts[q] - sz / 2, pts[q + 1] - sz / 2, sz, sz);
    }
  };
};

/* ---------------------------------------------------------------- WebGL: one full-screen fragment shader */

function Shader({ frag, scale }: { frag: string; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pointer = usePointer();
  const [start] = useState(() => (): [Step, () => void] => {
    const cv = ref.current!;
    const gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return [() => {}, () => {}];
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[SceneFx]", gl.getShaderInfoLog(s));
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(pr, "r");
    const uT = gl.getUniformLocation(pr, "t");
    const uM = gl.getUniformLocation(pr, "m");
    const uA = gl.getUniformLocation(pr, "act");
    const size = () => {
      cv.width = Math.max(1, Math.round(window.innerWidth * scale));
      cv.height = Math.max(1, Math.round(window.innerHeight * scale));
      gl.viewport(0, 0, cv.width, cv.height);
    };
    size();
    window.addEventListener("resize", size);
    let mx = 0.75;
    let my = 0.6;
    let act = 0.5;
    const step: Step = (t) => {
      const p = pointer.current;
      // no mouse: the «pointer» wanders by itself so the reactive part stays alive on phones
      const tx = p.on ? p.x / window.innerWidth : 0.5 + 0.38 * Math.sin(t * 0.11);
      const ty = p.on ? 1 - p.y / window.innerHeight : 0.5 + 0.3 * Math.sin(t * 0.08 + 1);
      mx += (tx - mx) * 0.03;
      my += (ty - my) * 0.03;
      gl.uniform2f(uR, cv.width, cv.height);
      gl.uniform1f(uT, t + 40);
      act += ((p.on ? 1 : 0.5) - act) * 0.02;
      gl.uniform2f(uM, mx, my);
      if (uA) gl.uniform1f(uA, act);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    return [step, () => window.removeEventListener("resize", size)];
  });
  useLoop(start);
  return <canvas ref={ref} className="fx-canvas fx-gl" />;
}
