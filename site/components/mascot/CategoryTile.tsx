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
import { categoryKind, type CategoryKind } from "./category-kind";
import "./category-tile.css";

/** One pass of each scene strip, ms (4 frames, timings from the generator manifest). */
const PASS_MS: Record<CategoryKind, number> = { mouse: 600, glides: 700, mousepad: 600, glass: 700, mechanical: 500, magnetic: 600, keycaps: 700, headset: 700, cable: 700, sleeve: 700, blower: 700, chair: 700, desk: 700, sale: 700 };
/** How many passes before the tile "presses": enough to read the gag, short enough not to annoy. */
const PASSES = 2;
const FADE_MS = 220;
/** The success beat: long enough to register «Ready!», short enough not to feel like a real wait. */
const DONE_MS = 650;

type Phase = "idle" | "scene" | "done";

export function CategoryTile({
  href,
  slug,
  name,
  count,
  loadingLabel,
  readyLabel,
}: {
  href: string;
  slug: string;
  name: string;
  count: string;
  loadingLabel: string;
  readyLabel: string;
}) {
  const kind = categoryKind(slug, name);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<number[]>([]);

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
    setPhase("scene");
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(FADE_MS + sceneMs, () => setPhase("done"));
    at(FADE_MS + sceneMs + DONE_MS, () => router.push(href));
  };

  return (
    <Link
      href={href}
      onClick={onClick}
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
        {phase !== "idle" && (
          <span
            className="mx-tile-scene"
            style={
              {
                backgroundImage: `url(/mascot/scenes/${kind}.webp)`,
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
