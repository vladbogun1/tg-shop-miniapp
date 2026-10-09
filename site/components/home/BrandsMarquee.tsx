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
 * are re-measured when the strip or a logo changes size. Hover/focus pauses, the button stops it
 * (WCAG 2.2.2), off-screen it does not animate, with reduced motion it is a plain horizontal
 * scroller of one copy. Repeats and the looping copy are aria-hidden and out of the tab order.
 */
import { Pause, Play } from "lucide-react";
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
  const [paused, setPaused] = useState(false);

  const list = useMemo(
    () => [...brands].filter((b) => b.productCount > 0).sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name)),
    [brands]
  );
  const [reps, setReps] = useState(() => Math.max(1, Math.ceil(GUESS_SCREEN / Math.max(1, list.length * GUESS_ITEM))));
  const [cycle, setCycle] = useState(50);

  // Measure one pass of the list; repeat it until a copy covers the screen; derive the speed.
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track || list.length === 0) return;
    const measure = () => {
      const copy = track.scrollWidth / 2;
      if (copy <= 0) return;
      const pass = copy / reps;
      const need = Math.max(1, Math.ceil(root.clientWidth / pass));
      if (need !== reps) setReps(need);
      setCycle(Math.min(MAX_CYCLE_S, Math.max(MIN_CYCLE_S, Math.round(pass / PX_PER_S))));
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
      data-paused={paused ? "" : undefined}
      style={{ "--bm-dur": `${cycle * reps}s` } as React.CSSProperties}
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
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? t("home.brands.play") : t("home.brands.pause")}
          title={paused ? t("home.brands.play") : t("home.brands.pause")}
          className="bm-toggle"
        >
          {paused ? <Play className="h-3.5 w-3.5" fill="currentColor" /> : <Pause className="h-3.5 w-3.5" fill="currentColor" />}
        </button>
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
        <img src={logo} alt="" className="bm-logo" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <span className="bm-word">{brand.name}</span>
      )}
      <span aria-hidden className="bm-count">
        {brand.productCount}
      </span>
    </Link>
  );
}
