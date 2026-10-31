"use client";

/** Жизненный цикл экрана кейса: блокировка прокрутки, фокус, Esc, холст для вспышек. Состояния экрана здесь не трогаем. */
import { useCallback, useEffect, useRef } from "react";
import { animate, type AnimationPlaybackControls } from "framer-motion";
import { CaseBurst } from "./case-particles";

/** Создаёт и возвращает ссылки экрана (корень, холст, «жив ли экран», анимация барабана, вспышки) и держит их жизненный цикл. */
export function useCaseOverlayLifecycle(closable: boolean, onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstRef = useRef<CaseBurst | null>(null);
  const alive = useRef(true);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const stopSpin = useCallback(() => anim.current?.stop(), []);
  // Scroll lock + Esc + focus.
  useEffect(() => {
    alive.current = true;
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const before = document.activeElement as HTMLElement | null;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
      html.style.overflow = prev[0];
      document.body.style.overflow = prev[1];
      stopSpin();
      burstRef.current?.destroy();
      try {
        before?.focus?.({ preventScroll: true });
      } catch {
        /* noop */
      }
    };
  }, [stopSpin]);
  const closableRef = useRef(closable);
  closableRef.current = closable;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closableRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Canvas for the bursts.
  useEffect(() => {
    if (!canvasRef.current) return;
    const b = new CaseBurst(canvasRef.current);
    burstRef.current = b;
    const onResize = () => b.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      b.destroy();
    };
  }, []);
  return { rootRef, canvasRef, burstRef, alive, anim };
}

export interface RevealBurstArgs {
  burst: CaseBurst | null;
  /** Область барабана: вспышка из её центра (нет — из центра окна). */
  viewport: DOMRect | undefined;
  rank: number;
  color: string;
  accent: string;
  shakeEl: HTMLElement | null;
  alive: { current: boolean };
}

/** Вспышка цвета редкости в момент показа приза; для редких (rank ≥ 3) — вторая вспышка и тряска экрана. */
export function playRevealBurst({ burst: b, viewport: vp, rank, color, accent, shakeEl, alive }: RevealBurstArgs) {
  if (!b) return;
  const cx = vp ? vp.left + vp.width / 2 : window.innerWidth / 2;
  const cy = vp ? vp.top + vp.height / 2 : window.innerHeight / 2;
  const big = rank >= 3;
  b.burst({ x: cx, y: cy, colors: [color, color, "#ffffff", accent], count: big ? 170 : 70 + rank * 25, power: big ? 900 : 560 });
  if (!big) return;
  window.setTimeout(() => alive.current && b.burst({ x: cx, y: cy - 40, colors: [color, "#ffe28a", "#fff"], count: 120, power: 1100, sparks: 0.6 }), 260);
  if (shakeEl) animate(shakeEl, { x: [0, -10, 9, -7, 6, -3, 0], y: [0, 4, -5, 3, -2, 1, 0] }, { duration: 0.6, ease: "easeOut" });
}
