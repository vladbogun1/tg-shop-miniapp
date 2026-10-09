"use client";

/**
 * Home-page brand marquee: a thin strip right under the hero with every brand that has products,
 * biggest first, running slowly in an endless loop. A brand is its logo (uploaded in the admin,
 * «Бренды»; MONO logos are recoloured to the site's white, ORIGINAL ones keep their colours) or, with
 * no logo, its name in the display font. Each one links to the catalogue filtered by that brand and
 * carries a small product count; hover lights it up.
 *
 * Same mechanics as the reviews ribbon (reviews-ribbon.css), in its own brands-marquee.css: the list
 * is rendered twice and the track slides by −50%, slots use a trailing margin so the copy starts
 * exactly there, edges fade with a mask. The list is repeated until one copy is at least a screen
 * wide (so the track is ≥ 2 screens and the loop never shows a gap); the repeat count and the speed
 * are re-measured when the strip or a logo changes size. Hover/focus pauses it (no pause button — owner's call)
 * (WCAG 2.2.2), off-screen it does not animate, with reduced motion it is a plain horizontal
 * scroller of one copy. Repeats and the looping copy are aria-hidden and out of the tab order.
 */
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { brandLogoSrc, type CatalogBrand } from "@shop/shared";
import { localePath } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { IMAGE_BASE } from "@/lib/config";
import "./brands-marquee.css";

/** Seconds for one pass of the brand list — slow on purpose, the strip is ambient. */
const MIN_CYCLE_S = 40;
const MAX_CYCLE_S = 60;
/** Speed that sets the cycle inside [MIN, MAX] (px/s). */
const PX_PER_S = 80;
/** First-render guess of a copy's width (no layout yet): a wide desktop. */
const GUESS_SCREEN = 1920;
const GUESS_ITEM = 170;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function BrandsMarquee({ brands }: { brands: CatalogBrand[] }) {
  const { t, locale } = useI18n();
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);

  const list = useMemo(
    () => [...brands].filter((b) => b.productCount > 0).sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name)),
    [brands]
  );
  const [reps, setReps] = useState(() => Math.max(1, Math.ceil(GUESS_SCREEN / Math.max(1, list.length * GUESS_ITEM))));
  /** Last applied copy width (px) and duration (ms) — to carry the visible offset across a change. */
  const applied = useRef<{ copy: number; dur: number } | null>(null);

  // Measure one copy exactly; repeat the list until a copy covers the screen; derive the speed.
  // The duration (--bm-dur) is written straight onto the track. Whenever the copy width or the
  // duration changes (a logo loads, a broken one falls back to its name, the font swaps, the strip
  // resizes) the running animation is re-timed so the strip keeps the same pixel offset: otherwise
  // the −50% track jumps by `progress × Δwidth` (a new duration — by `Δprogress × width`) on every
  // change. Together with lazy logos loading one by one as they slid in, that was the "twitch"
  // towards the end of the loop (the jump grows with progress).
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track || list.length === 0) return;
    const measure = () => {
      const slots = track.children;
      const half = slots.length / 2;
      // Reduced motion hides the looping copy (display: none) — nothing to measure then.
      if (half < 1 || (slots[half] as HTMLElement).offsetParent === null) return;
      // Distance from copy 1 to copy 2 = one copy, sub-pixel exact (both rects share the transform).
      const copy = (slots[half] as HTMLElement).getBoundingClientRect().left - (slots[0] as HTMLElement).getBoundingClientRect().left;
      if (copy <= 0) return;
      const pass = copy / reps;
      const need = Math.max(1, Math.ceil(root.clientWidth / pass));
      const cycle = Math.min(MAX_CYCLE_S, Math.max(MIN_CYCLE_S, Math.round(pass / PX_PER_S)));
      const dur = cycle * reps * 1000;
      // Before the first measure the CSS default duration runs (50s) — re-time from it.
      const prev = applied.current ?? { copy, dur: parseFloat(getComputedStyle(track).animationDuration) * 1000 || dur };
      if (!applied.current || Math.abs(prev.copy - copy) > 0.01 || prev.dur !== dur) {
        const anim = track.getAnimations().find((a) => (a as CSSAnimation).animationName === "bm-marquee");
        const t = anim && typeof anim.currentTime === "number" ? anim.currentTime : null;
        track.style.setProperty("--bm-dur", `${dur}ms`);
        applied.current = { copy, dur };
        if (anim && t !== null) {
          // Same offset in px as before (modulo one copy — the content repeats every pass).
          const offset = ((t % prev.dur) / prev.dur) * prev.copy;
          void getComputedStyle(track).animationDuration; // apply the new duration before re-timing
          anim.currentTime = ((offset % copy) / copy) * dur;
        }
      }
      if (need !== reps) setReps(need);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(track);
    return () => ro.disconnect();
  }, [list, reps]);

  // Off screen: no animation at all (data-off pauses it in CSS).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) delete root.dataset.off;
      else root.dataset.off = "";
    });
    io.observe(root);
    return () => io.disconnect();
  }, []);

  if (list.length === 0) return null;

  const slots: { brand: CatalogBrand; key: string; dup: boolean }[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (let r = 0; r < reps; r++) {
      for (const b of list) slots.push({ brand: b, key: `${copy}-${r}-${b.id}`, dup: copy > 0 || r > 0 });
    }
  }

  return (
    <nav
      ref={rootRef}
      className="bm-strip"
      aria-label={t("home.brands.label")}
    >
      <div className="container-site bm-inner">
        <span aria-hidden className="bm-label">
          <span className="bm-label-tick" />
          {t("home.brands.label")}
        </span>
        <div className="bm-row">
          <ul ref={trackRef} className="bm-track">
            {slots.map((s) => (
              <li key={s.key} className="bm-slot" data-dup={s.dup ? "" : undefined} aria-hidden={s.dup || undefined}>
                <BrandItem brand={s.brand} href={localePath(locale, `/catalog?brand=${encodeURIComponent(s.brand.slug)}`)} hidden={s.dup} countLabel={t("home.categoryCount", { n: s.brand.productCount })} />
                <span aria-hidden className="bm-sep" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}

function BrandItem({ brand, href, hidden, countLabel }: { brand: CatalogBrand; href: string; hidden: boolean; countLabel: string }) {
  const [broken, setBroken] = useState(false);
  const logo = brand.logoUrl && !broken ? brandLogoSrc(brand.logoUrl, IMAGE_BASE, 360, 96) : null;
  return (
    <Link
      href={href}
      className="bm-item"
      data-mode={logo ? (brand.logoMode === "ORIGINAL" ? "original" : "mono") : "word"}
      tabIndex={hidden ? -1 : undefined}
      aria-label={hidden ? undefined : `${brand.name}, ${countLabel}`}
      prefetch={false}
    >
      {logo ? (
        // A logo has no fixed aspect ratio: fixed height, natural width (the strip re-measures on load).
        // Not lazy: a lazy logo near the end of the list would load only as it slides in and widen
        // the track right then; eager ones settle in the first second.
        <img src={logo} alt="" className="bm-logo" decoding="async" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <span className="bm-word">{brand.name}</span>
      )}
      <span aria-hidden className="bm-count">
        {brand.productCount}
      </span>
    </Link>
  );
}
