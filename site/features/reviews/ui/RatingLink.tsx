"use client";

/** "★★★★☆ 4,6 · 12 відгуків" under the product title; jumps to the reviews section. Hidden with no reviews. */
import { useI18n } from "@/i18n/context";
import { formatRating, Stars } from "./Stars";

export function RatingLink({ avg, count }: { avg?: number | null; count?: number }) {
  const { t, tag } = useI18n();
  if (!count || count <= 0 || avg == null) return null;
  const value = formatRating(avg, tag);
  return (
    <a
      href="#reviews"
      className="mt-2 inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--accent-hi)]"
    >
      <Stars value={avg} label={t("reviews.stars", { n: value })} />
      <span className="font-display font-bold tabular-nums text-[var(--ink)]">{value}</span>
      <span className="underline decoration-[var(--line-strong)] underline-offset-4">{t("reviews.count", { n: count })}</span>
    </a>
  );
}

/** Tiny "★ 4,8 (12)" for catalog tiles. */
export function RatingMini({ avg, count }: { avg?: number | null; count?: number }) {
  const { t, tag } = useI18n();
  if (!count || count <= 0 || avg == null) return null;
  const value = formatRating(avg, tag);
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--muted)]"
      aria-label={`${t("reviews.stars", { n: value })}, ${t("reviews.count", { n: count })}`}
    >
      <span aria-hidden className="text-[var(--accent)]">★</span>
      <span aria-hidden className="tabular-nums text-[var(--ink)]">{value}</span>
      <span aria-hidden className="tabular-nums">({count})</span>
    </span>
  );
}
