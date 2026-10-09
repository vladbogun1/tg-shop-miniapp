"use client";

/**
 * Home-page reviews ribbon: the newest published reviews (with a text) run in an endless marquee —
 * two rows in opposite directions on wider screens, one row on phones. Every few seconds one card
 * that is on screen "surfaces": it lifts out of the ribbon and plays the effect of its rating tier
 * (styles in globals.css, `.rv-*`):
 *
 *   5★ legend — rotating orange border, glow, stars flare one by one, sparks burst, shine sweep
 *   4★ epic   — warm glow, shine sweep, stars pop
 *   3★ solid  — small lift, the border lights up
 *   1–2★ low  — no lift, a short HUD glitch
 *
 * The pick is random but weighted towards higher ratings. Hover/focus pauses a row and surfaces the
 * card under the pointer; the owner asked for no pause button. With reduced motion
 * the rows are plain horizontal scrollers and nothing surfaces.
 */
import { Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import type { FeedReview, ReviewSummary } from "@shop/shared";
import { localePath } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";
import { formatRating } from "@/components/reviews/Stars";
import "@/components/mascot/mascot.css";
import "./reviews-ribbon.css";

type Tier = "legend" | "epic" | "solid" | "low";

function tierOf(rating: number): Tier {
  if (rating >= 5) return "legend";
  if (rating === 4) return "epic";
  if (rating === 3) return "solid";
  return "low";
}

/** How long a surfaced card stays up, per tier (ms) — matches the CSS animations. */
const SPOT_MS: Record<Tier, number> = { legend: 2600, epic: 2100, solid: 1700, low: 1100 };
/** Relative odds of being picked: the ribbon should mostly celebrate, but low ones are not hidden. */
const WEIGHT: Record<Tier, number> = { legend: 6, epic: 4, solid: 2, low: 1 };
/** Pause between two surfacings (ms). */
const GAP_MS = 900;
/** A group must be wider than a 1920px screen for the loop to be seamless: 8 × (320 + 16)px. */
const MIN_GROUP = 8;
/**
 * Two rows only when each can hold a full group of different reviews; with fewer, one row shows
 * them all and a review never appears twice on a wide screen at once.
 */
const TWO_ROWS_FROM = MIN_GROUP * 2;
/** Seconds a card needs to cross its own width — sets the marquee speed (~55 px/s). */
const SEC_PER_CARD = 6;
/** Spark particles of a 5★ card: angle (deg) and distance (px), fixed so SSR and client agree. */
const SPARKS = [
  [-160, 46], [-130, 62], [-100, 54], [-70, 66], [-40, 50], [-15, 58],
  [10, 44], [35, 60], [-115, 34], [-55, 38], [160, 40], [-185, 52],
] as const;

interface Slot {
  review: FeedReview;
  key: string;
  /** A repeat of a card already in the group, or the second (looping) copy — hidden from AT. */
  dup: boolean;
}

/**
 * Orders reviews so that two neighbours are never about the same product — the ribbon is a loop,
 * so the last one also differs from the first when possible. Greedy: always take from the product
 * with the most reviews left (newest first within a product) that is not the previous one.
 */
export function spread(list: FeedReview[]): FeedReview[] {
  const buckets = new Map<string, FeedReview[]>();
  for (const r of list) {
    const b = buckets.get(r.productSlug);
    if (b) b.push(r);
    else buckets.set(r.productSlug, [r]);
  }
  const out: FeedReview[] = [];
  while (out.length < list.length) {
    const prev = out[out.length - 1]?.productSlug;
    const last = out.length === list.length - 1;
    let best: FeedReview[] | null = null;
    let bestScore = -1;
    for (const [slug, b] of buckets) {
      if (b.length === 0 || (slug === prev && buckets.size > 1)) continue;
      // Prefer not to close the loop on the first card's product.
      const score = b.length * 2 + (last && slug === out[0]?.productSlug ? -1 : 0);
      if (score > bestScore) {
        best = b;
        bestScore = score;
      }
    }
    if (!best) best = buckets.get(prev ?? "") ?? [];
    out.push(best.shift()!);
  }
  return out;
}

/**
 * Repeats the list until a group is wide enough, then appends the looping copy. Whole repeats only
 * (a multiple of the list length), so at every seam the last card is followed by the first one —
 * never by itself.
 */
function track(list: FeedReview[], row: string): Slot[] {
  if (list.length === 0) return [];
  const ordered = spread(list);
  const size = ordered.length * Math.ceil(MIN_GROUP / ordered.length);
  const group: Slot[] = [];
  for (let i = 0; i < size; i++) {
    const review = ordered[i % ordered.length];
    group.push({ review, key: `${row}-${i}-${review.id}`, dup: i >= ordered.length });
  }
  return [...group, ...group.map((s) => ({ ...s, key: `${s.key}-loop`, dup: true }))];
}

export function ReviewsRibbon({ summary, items }: { summary: ReviewSummary; items: FeedReview[] }) {
  const { t, tag } = useI18n();
  const rootRef = useRef<HTMLElement>(null);

  // Desktop: alternate reviews between the rows so neighbours differ; phones: one row of all.
  const rows = useMemo(() => {
    const two = items.length >= TWO_ROWS_FROM;
    const a = two ? items.filter((_, i) => i % 2 === 0) : items;
    const b = two ? items.filter((_, i) => i % 2 === 1) : [];
    const all = track(items, "m");
    const top = track(a, "a");
    const bottom = track(b, "b");
    // A track is the group twice; the group size drives the speed.
    return { all, top, bottom, allCount: all.length / 2, topCount: top.length / 2, bottomCount: bottom.length / 2 };
  }, [items]);

  // Surfacing loop: only while the ribbon is on screen, the tab is visible and motion is allowed.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let timer: number | undefined;
    let current: HTMLElement | null = null;

    const clear = () => {
      if (current) delete current.dataset.spot;
      current = null;
      // the pixel mascot by the heading reads on, then cheers a 5★ spotlight (CSS: mascot.css §4)
      delete root.dataset.legend;
    };

    const pick = (): HTMLElement | null => {
      // Mostly on screen (≥85% of the width): on a phone a card is never fully inside the faded edges.
      const right = window.innerWidth;
      const cards = Array.from(root.querySelectorAll<HTMLElement>(".rv-card")).filter((el) => {
        if (el.closest(".rv-row:hover, .rv-row:focus-within")) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0) return false;
        const shown = Math.min(r.right, right) - Math.max(r.left, 0);
        return shown >= r.width * 0.85;
      });
      if (cards.length === 0) return null;
      const total = cards.reduce((sum, el) => sum + WEIGHT[(el.dataset.tier as Tier) ?? "solid"], 0);
      let roll = Math.random() * total;
      for (const el of cards) {
        roll -= WEIGHT[(el.dataset.tier as Tier) ?? "solid"];
        if (roll <= 0) return el;
      }
      return cards[cards.length - 1];
    };

    const tick = () => {
      clear();
      if (!visible || reduce.matches || document.hidden) {
        timer = window.setTimeout(tick, 1200);
        return;
      }
      const el = pick();
      if (!el) {
        timer = window.setTimeout(tick, 800);
        return;
      }
      current = el;
      el.dataset.spot = "";
      const tier = (el.dataset.tier as Tier) ?? "solid";
      if (tier === "legend") root.dataset.legend = "";
      timer = window.setTimeout(() => {
        clear();
        timer = window.setTimeout(tick, GAP_MS);
      }, SPOT_MS[tier]);
    };

    // Below the fold: hide the cards until they scroll in, then let them pop in (CSS, by tier).
    // Already on screen at load: leave them be — hiding them now would only flicker.
    if (!reduce.matches && root.getBoundingClientRect().top > window.innerHeight) root.dataset.armed = "";

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) root.dataset.in = "";
      },
      { threshold: 0.25 }
    );
    io.observe(root);
    timer = window.setTimeout(tick, 1400);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      clear();
    };
  }, []);

  if (items.length === 0) return null;

  const avg = summary.avg ?? 0;
  const avgLabel = formatRating(avg, tag);

  return (
    <section
      ref={rootRef}
      className="rv-ribbon mt-16 md:mt-20"
      aria-labelledby="home-reviews"
    >
      <div className="container-site mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 id="home-reviews" className="flex min-w-0 items-center gap-3 font-display text-[24px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[32px]">
          <span aria-hidden className="tech-mark" />
          <span className="min-w-0">{t("home.reviews.title")}</span>
          <span aria-hidden className="mx-rv">
            <span className="mx-rv-f" />
            <span className="mx-rv-stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} style={{ "--i": i } as React.CSSProperties} />
              ))}
            </span>
          </span>
        </h2>
        <div className="flex items-center gap-3">
          {summary.count > 0 && (
            <p className="rv-score inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-2.5 pr-4">
              <span aria-hidden className="rv-live" />
              <span className="font-display text-[20px] font-extrabold leading-none tabular-nums text-[var(--ink)]">{avgLabel}</span>
              <Star aria-hidden className="h-4 w-4 text-[var(--accent)]" fill="currentColor" strokeWidth={0} />
              <span className="sr-only">{t("reviews.stars", { n: avgLabel })}, </span>
              <span className="text-[13px] font-semibold text-[var(--muted)]">{t("reviews.count", { n: summary.count })}</span>
            </p>
          )}
        </div>
      </div>

      {/* Phones: one row of everything. */}
      <div className="sm:hidden">
        <Row slots={rows.all} count={rows.allCount} dir="left" />
      </div>
      {/* Tablet and up: two rows running against each other (one row when there are few reviews). */}
      <div className="hidden flex-col gap-4 sm:flex">
        <Row slots={rows.top} count={rows.topCount} dir="left" />
        {rows.bottom.length > 0 && <Row slots={rows.bottom} count={rows.bottomCount} dir="right" slower />}
      </div>
    </section>
  );
}

function Row({ slots, count, dir, slower = false }: { slots: Slot[]; count: number; dir: "left" | "right"; slower?: boolean }) {
  const seconds = Math.round(count * SEC_PER_CARD * (slower ? 1.18 : 1));
  return (
    <div className="rv-row" data-dir={dir} style={{ "--rv-dur": `${seconds}s` } as React.CSSProperties}>
      <ul className="rv-track">
        {slots.map((s, i) => (
          <li key={s.key} className="rv-slot" data-dup={s.dup ? "" : undefined} aria-hidden={s.dup || undefined}>
            <ReviewCard review={s.review} order={i % count} hidden={s.dup} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({ review, order, hidden }: { review: FeedReview; order: number; hidden: boolean }) {
  const { t, locale } = useI18n();
  const fmt = useFmt();
  const tier = tierOf(review.rating);
  const author = review.author?.trim() || t("reviews.customer");
  const stars = Math.max(1, Math.min(5, review.rating));

  return (
    <Link
      href={localePath(locale, `/product/${review.productSlug}#reviews`)}
      className="rv-card"
      data-tier={tier}
      tabIndex={hidden ? -1 : undefined}
      aria-label={hidden ? undefined : `${t("home.reviews.open", { title: review.productTitle })}: ${t("reviews.stars", { n: stars })}`}
      style={{ "--k": order } as React.CSSProperties}
    >
      <span aria-hidden className="rv-fx" />
      <span aria-hidden className="rv-shine" />
      <span className="rv-body">
        <span className="rv-head">
          <span className="rv-stars" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className="rv-star"
                data-on={i < stars ? "" : undefined}
                style={{ "--i": i } as React.CSSProperties}
                fill={i < stars ? "currentColor" : "none"}
                strokeWidth={i < stars ? 0 : 1.75}
              />
            ))}
            {tier === "legend" && (
              <span className="rv-sparks">
                {SPARKS.map(([a, d], i) => (
                  <span key={i} style={{ "--a": `${a}deg`, "--d": `${d}px`, "--j": i } as React.CSSProperties} />
                ))}
              </span>
            )}
          </span>
          <span aria-hidden className="rv-quote">
            &ldquo;
          </span>
        </span>
        <span className="rv-text">{review.text}</span>
        <span className="rv-meta">
          <span className="rv-author">{author}</span>
          {review.publishedAt && <span className="rv-date">{fmt.date(review.publishedAt)}</span>}
        </span>
        <span className="rv-product">
          <span className="rv-thumb">
            <Image src={review.imageUrl} alt="" size={96} className="h-full w-full" />
          </span>
          <span className="rv-ptitle">{review.productTitle}</span>
        </span>
      </span>
    </Link>
  );
}
