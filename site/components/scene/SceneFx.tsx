"use client";

/**
 * Page background ("scene") with a motion layer on top: orange sparks slowly rising from the bottom.
 * The owner picked it out of 23 variants (2026-10, the others are in commit ac14999,
 * "experiment(site): 23 варианта…").
 *
 * Performance rules (iOS lesson, see globals.css .scene): the canvas renders at DPR ≤ 1.5, caps at
 * 30 fps on touch devices, stops while the tab is hidden and draws a single still frame with
 * prefers-reduced-motion. Each spark is a pre-rendered glow sprite — no shadowBlur per particle.
 */
import { useEffect, useRef } from "react";
import "./scene-fx.css";

/** Overall tempo of the sparks (1 = the variant as first shown; the owner asked for 20 % slower). */
const SPEED = 0.8;

export function SceneFx() {
  return (
    <div className="scene" data-fx="embers" aria-hidden>
      <Embers />
    </div>
  );
}

type Env = { w: number; h: number; px: number; py: number; pointer: boolean; scroll: number };
type Step = (t: number, dt: number) => void;

function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  const pointer = usePointer();

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const env: Env = { w: 0, h: 0, px: 0, py: 0, pointer: false, scroll: window.scrollY };
    let frame: Step = () => {};
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      env.w = window.innerWidth;
      env.h = window.innerHeight;
      cv.width = Math.round(env.w * dpr);
      cv.height = Math.round(env.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame = embers(ctx, env);
    };
    size();
    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(() => {
        size();
        if (still) frame(8, 0);
      }, 150);
    };
    window.addEventListener("resize", onResize);
    const step: Step = (t, dt) => {
      env.px = pointer.current.x;
      env.py = pointer.current.y;
      env.pointer = pointer.current.on;
      env.scroll = window.scrollY;
      frame(t * SPEED, dt * SPEED);
    };

    let raf = 0;
    const vis = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    const minGap = coarse ? 1000 / 31 : 0;
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
    if (still) step(8, 0);
    else {
      raf = requestAnimationFrame(tick);
      document.addEventListener("visibilitychange", vis);
    }
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("resize", onResize);
      clearTimeout(rt);
    };
  }, [pointer]);

  return <canvas ref={ref} className="fx-canvas" />;
}

/** Mouse position only — on touch screens the sparks just float. */
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

/** Sparks rising from the bottom; nearer ones are bigger, faster and parallax with the scroll,
 *  the mouse pushes them aside. Returns the per-frame painter for the current canvas size. */
function embers(ctx: CanvasRenderingContext2D, env: Env): Step {
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
  return (t, dt) => {
    const e = env;
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
      const flick = 0.65 + 0.35 * Math.sin(t * (6 + (p.seed % 5)) + p.seed);
      const s = p.r * 7;
      ctx.globalAlpha = Math.max(0, fade * flick * (0.35 + p.depth * 0.55));
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };
}
