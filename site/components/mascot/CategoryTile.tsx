"use client";

/**
 * A home category tile with three levels of life:
 *   rest   — the category's device icon floats gently (CSS, mascot.css §3);
 *   hover  — it perks up: lifts, tilts, glows, a glint runs over it;
 *   click  — the icon fades out and the category's character scene fades in and plays a few times
 *            (the robot wipes the glass pad, the mascot flicks the mouse…) while a loading bar fills
 *            («picking the gear…»); then a clear success beat — bar full and green, «Ready!» with a tick,
 *            the scene holds its punchline frame, the tile rim flashes — and only then the link
 *            navigates. Modified clicks (new tab, etc.) and reduced motion skip the show.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { artKindOf, type CategoryKind } from "./category-kind";
import "./category-tile.css";

/** One pass of each scene strip, ms (4 frames, timings from the generator manifest). */
const PASS_MS: Record<CategoryKind, number> = { mouse: 600, glides: 700, mousepad: 600, glass: 700, mechanical: 500, magnetic: 600, keycaps: 700, headset: 700, cable: 700, sleeve: 700, blower: 700, chair: 700, desk: 700, sale: 700 };
/** How many passes before the tile "presses": enough to read the gag, short enough not to annoy. */
const PASSES = 2;
const FADE_MS = 220;
/** The success beat: long enough to register «Ready!», short enough not to feel like a real wait. */
const DONE_MS = 650;

/** Longest we hold the tile on «loading» waiting for a scene strip on a slow line before showing it anyway. */
const MAX_WAIT_MS = 2500;

type Phase = "idle" | "wait" | "scene" | "done";

/**
 * Scene strips (~20–50 KB each) are fetched ahead: each tile's strip when the browser is idle once the
 * tile comes within ~a screen of the viewport, and at once on hover / focus / touch. The click
 * then never shows an empty slot; if the strip is still on its way, the tile waits on «loading».
 */
const sceneSrc = (kind: CategoryKind) => `/mascot/scenes/${kind}.webp`;
const scenes = new Map<CategoryKind, Promise<void>>();
function preloadScene(kind: CategoryKind): Promise<void> {
  let p = scenes.get(kind);
  if (!p) {
    const img = new Image();
    img.decoding = "async";
    img.src = sceneSrc(kind);
    p = (img.decode ? img.decode() : new Promise<void>((ok, fail) => ((img.onload = () => ok()), (img.onerror = fail)))).catch(() => {
      scenes.delete(kind); // let a later attempt retry
    });
    scenes.set(kind, p);
  }
  return p;
}
const idle = (fn: () => void) => {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 300);
};

export function CategoryTile({
  href,
  slug,
  name,
  artKind,
  count,
  loadingLabel,
  readyLabel,
}: {
  href: string;
  slug: string;
  name: string;
  /** Catalog v2 category art; null = guessed from slug/name. */
  artKind?: string | null;
  count: string;
  loadingLabel: string;
  readyLabel: string;
}) {
  const kind = artKindOf(artKind, slug, name);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<number[]>([]);
  const ref = useRef<HTMLAnchorElement>(null);

  // fetch this tile's scene in the background once the grid is within ~a screen of the viewport
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          idle(() => void preloadScene(kind));
        }
      },
      { rootMargin: "1000px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [kind]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  // coming back with the browser's back button restores the tile from the bfcache mid-show
  useEffect(() => {
    const reset = () => setPhase("idle");
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const pass = PASS_MS[kind];
  const sceneMs = pass * PASSES;

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    if (phase !== "idle") return;
    router.prefetch(href);
    setPhase("wait");
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setPhase("scene");
      at(FADE_MS + sceneMs, () => setPhase("done"));
      at(FADE_MS + sceneMs + DONE_MS, () => router.push(href));
    };
    void preloadScene(kind).then(start);
    at(MAX_WAIT_MS, start);
  };
  const warm = () => void preloadScene(kind);

  return (
    <Link
      ref={ref}
      href={href}
      onClick={onClick}
      onPointerEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      data-phase={phase}
      aria-busy={phase !== "idle" || undefined}
      className="mx-tile nb nb-hover group relative isolate flex h-full min-h-[136px] flex-col overflow-hidden bg-[radial-gradient(circle_at_85%_85%,rgba(255,102,0,.10),transparent_55%)] p-3.5 sm:min-h-[148px] sm:p-4"
    >
      <span className="relative z-10 max-w-[72%] font-display text-[15px] font-bold uppercase leading-tight tracking-[.04em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[16px]">
        {name}
      </span>
      <span className="mx-tile-count relative z-10 mt-auto max-w-[48%] pt-2 text-[12px] font-medium text-[var(--muted)]">{count}</span>
      {phase !== "idle" && (
        <span role="status" className="mx-tile-status">
          {phase === "done" ? (
            <>
              <svg aria-hidden viewBox="0 0 16 16" className="mx-tile-tick">
                <path d="M3 8.5l3 3 7-7" />
              </svg>
              {readyLabel}
            </>
          ) : (
            loadingLabel
          )}
        </span>
      )}

      <span aria-hidden className="mx-tile-art">
        <span className="mx-tile-glow" />
        <span className="mx-tile-icon">
          { }
          <img src={`/mascot/icons/${kind}.webp`} alt="" loading="lazy" decoding="async" draggable={false} />
          <span className="mx-tile-glint" style={{ "--icon": `url(/mascot/icons/${kind}.webp)` } as React.CSSProperties} />
        </span>
        {(phase === "scene" || phase === "done") && (
          <span
            className="mx-tile-scene"
            style={
              {
                backgroundImage: `url(${sceneSrc(kind)})`,
                "--pass": `${pass}ms`,
                "--passes": PASSES,
                "--fade": `${FADE_MS}ms`,
              } as React.CSSProperties
            }
          />
        )}
      </span>
      <span aria-hidden className="mx-tile-flash" />
      {phase !== "idle" && (
        <span aria-hidden className="mx-tile-bar" style={{ "--load": `${FADE_MS + sceneMs}ms` } as React.CSSProperties}>
          <i />
        </span>
      )}
    </Link>
  );
}
