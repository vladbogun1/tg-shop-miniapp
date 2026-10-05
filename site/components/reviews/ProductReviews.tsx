"use client";

/**
 * Product page reviews (V44): summary (big average, stars, count, 5→1 bars) + the list, newest
 * first. The first page comes from the server (in the HTML for SEO); "Show more" pulls the next
 * pages from the public endpoint. Without reviews: a short empty state with the review bonus hint.
 */
import { Loader2, MessageSquareText, Store } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicReview, ReviewPage, ReviewSummary } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { useFmt } from "@/lib/use-fmt";
import { formatRating, Stars } from "./Stars";

export const REVIEWS_PAGE_SIZE = 10;

export function ProductReviews({ slug, initial }: { slug: string; initial: ReviewPage | null }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<ReviewSummary | null>(initial?.summary ?? null);
  const [items, setItems] = useState<PublicReview[]>(initial?.items ?? []);
  const [page, setPage] = useState(initial?.page ?? 0);
  const [totalPages, setTotalPages] = useState(initial?.totalPages ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(next: number) {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.productReviews(slug, next, REVIEWS_PAGE_SIZE);
      setSummary(res.summary);
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return next === 0 ? res.items : [...prev, ...res.items.filter((r) => !seen.has(r.id))];
      });
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("reviews.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  // The server fetch failed (backend hiccup) — try once from the browser.
  useEffect(() => {
    if (!initial) void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = summary?.count ?? 0;
  const hasMore = page + 1 < totalPages;

  return (
    <section id="reviews" className="mt-12 max-w-4xl scroll-mt-[calc(var(--header-h)+24px)]" aria-labelledby="pd-reviews">
      <h2 id="pd-reviews" className="mb-4 flex items-center gap-3 font-display text-[22px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
        <span aria-hidden className="tech-mark" />
        {t("reviews.title")}
        {count > 0 && <span className="font-display text-[16px] font-bold tabular-nums text-[var(--muted)]">{count}</span>}
      </h2>

      {count === 0 && !busy && !err && (
        <div className="nb flex flex-col items-start gap-2 p-5 sm:flex-row sm:items-center sm:gap-4 sm:p-6">
          <MessageSquareText className="h-8 w-8 shrink-0 text-[var(--accent)]" strokeWidth={1.75} />
          <div>
            <p className="font-display text-[16px] font-bold uppercase tracking-[.04em] text-[var(--ink)]">{t("reviews.empty.title")}</p>
            <p className="mt-1 text-[14px] font-medium text-[var(--muted)]">{t("reviews.empty.text")}</p>
          </div>
        </div>
      )}

      {summary && count > 0 && (
        <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
          <Summary summary={summary} />
          <div className="min-w-0">
            <ul className="flex flex-col gap-3">
              {items.map((r) => (
                <ReviewItem key={r.id} review={r} />
              ))}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={() => void load(page + 1)}
                disabled={busy}
                className="tap nb-up mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[rgba(255,255,255,.28)] hover:bg-[var(--surface-3)] disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("reviews.loadMore")}
              </button>
            )}
          </div>
        </div>
      )}

      {busy && count === 0 && (
        <p className="flex items-center gap-2 text-[14px] font-medium text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      )}
      {err && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-[var(--danger)]">
          {err}
        </p>
      )}
    </section>
  );
}

function Summary({ summary }: { summary: ReviewSummary }) {
  const { t, tag } = useI18n();
  const avg = summary.avg ?? 0;
  const value = formatRating(avg, tag);
  const max = Math.max(1, ...summary.distribution);
  return (
    <div className="nb self-start p-5">
      <div className="flex items-end gap-3">
        <span className="font-display text-[44px] font-extrabold leading-none tabular-nums text-[var(--ink)]">{value}</span>
        <div className="pb-1">
          <Stars value={avg} size={18} label={t("reviews.stars", { n: value })} />
          <p className="mt-1 text-[13px] font-semibold text-[var(--muted)]">{t("reviews.count", { n: summary.count })}</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = summary.distribution[stars - 1] ?? 0;
          return (
            <li key={stars} className="flex items-center gap-2 text-[12px] font-semibold text-[var(--muted)]" aria-label={t("reviews.distRow", { stars, n })}>
              <span aria-hidden className="w-6 shrink-0 tabular-nums">
                {stars}
                <span className="text-[var(--accent)]">★</span>
              </span>
              <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span aria-hidden className="w-7 shrink-0 text-right tabular-nums">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewItem({ review }: { review: PublicReview }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const when = review.publishedAt ?? review.createdAt;
  return (
    <li className="nb p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[14px] font-semibold text-[var(--ink)]">{review.author?.trim() || t("reviews.customer")}</span>
        <Stars value={review.rating} size={14} label={t("reviews.stars", { n: review.rating })} />
        <time dateTime={when} className="ml-auto text-[12px] font-medium text-[var(--faint)]">
          {fmt.date(when)}
        </time>
      </div>
      {review.variantName && (
        <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
          {t("product.variant")}: {review.variantName}
        </p>
      )}
      {review.text && <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-[#D4D4D8]">{review.text}</p>}
      {review.adminReply && <ShopReply text={review.adminReply} />}
    </li>
  );
}

export function ShopReply({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-[var(--r)] border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[.08em] text-[var(--accent-hi)]">
        <Store className="h-3.5 w-3.5" strokeWidth={2.25} /> {t("reviews.shopReply")}
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-[14px] text-[var(--ink)]">{text}</p>
    </div>
  );
}
