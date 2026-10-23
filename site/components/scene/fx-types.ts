/** Shared types of the canvas background effects (SceneFx). */
export type Env = {
  w: number;
  h: number;
  dpr: number;
  /** pointer in viewport px; `pointer` is false when there is no mouse over the page */
  px: number;
  py: number;
  pointer: boolean;
  scroll: number;
  /** prefers-reduced-motion: the painter is called once */
  still: boolean;
};
export type Frame = (ctx: CanvasRenderingContext2D, env: Env, t: number, dt: number) => void;
/** Called once per canvas size; returns the per-frame painter (its closure keeps the state). */
export type Draw = (env: Env) => Frame;

/** 1 in the corners, `calm` under the content column in the middle. */
export function edgeFactor(env: Env, calm: number) {
  const cx = env.w / 2;
  const cy = env.h * 0.42;
  const maxd = Math.hypot(cx, cy);
  return (x: number, y: number) => calm + (1 - calm) * Math.min(1, (Math.hypot(x - cx, y - cy) / maxd) * 1.4);
}

/** Canvas `font` does not resolve CSS variables — read the display font family once. */
export function displayFont(weight: number, px: number) {
  const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
  return `${weight} ${px}px ${fam}`;
}
