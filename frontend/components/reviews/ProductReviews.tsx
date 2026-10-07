"use client";

/**
 * Reviews section of the product sheet: rating summary (avg, stars, count, 5★…1★ bars), the list
 * of published reviews (author or a localized "Customer", stars, date, variant, text, the shop's
 * reply) and "Show more" pagination. Public endpoint — works before the Telegram sign-in finishes.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageSquareText, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/context";
import { formatDate } from "@/lib/format";
import { reviewKeys, reviewsApi, type PublicReview, type ReviewSummary } from "@/lib/reviews";
import { haptic } from "@/lib/telegram";
import { formatRating, Stars } from "./Stars";

export function ProductReviews({ productId }: { productId: string }) {
  const t = useT();
  const q = useInfiniteQuery({
    queryKey: reviewKeys.product(productId),
    queryFn: ({ pageParam }) => reviewsApi.productReviews(productId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
    staleTime: 60_000,
  });

  const first = q.data?.pages[0];
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section aria-labelledby={`reviews-${productId}`} className="mt-6">
      <h3 id={`reviews-${productId}`} className="eyebrow mb-3 !tracking-[0.2em]">
        {t("reviews.title")}
        {first && first.summary.count > 0 ? ` · ${first.summary.count}` : ""}
      </h3>

      {q.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="shimmer h-[104px] rounded-[var(--r-card)]" />
          <div className="shimmer h-[88px] rounded-[var(--r-card)]" />
        </div>
      )}

      {q.isError && (
        <div className="nb flex items-center justify-between gap-3 p-4">
          <p className="text-[13px] text-[var(--muted)]">{t("reviews.loadError")}</p>
          <Button size="sm" onClick={() => void q.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {first && first.summary.count === 0 && (
        <div className="nb flex flex-col items-center gap-2 px-6 py-7 text-center">
          <MessageSquareText className="h-6 w-6 text-[var(--accent)]" strokeWidth={2.25} />
          <p className="font-display text-[14px] font-bold text-[var(--ink)]">{t("reviews.empty.title")}</p>
          <p className="max-w-[280px] text-[12px] text-[var(--muted)]">{t("reviews.empty.text")}</p>
        </div>
      )}

      {first && first.summary.count > 0 && (
        <>
          <SummaryCard summary={first.summary} />
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </ul>
          {q.hasNextPage && (
            <Button
              fullWidth
              className="mt-3"
              loading={q.isFetchingNextPage}
              onClick={() => {
                haptic();
                void q.fetchNextPage();
              }}
            >
              {t("reviews.showMore")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function SummaryCard({ summary }: { summary: ReviewSummary }) {
  const t = useT();
  const max = Math.max(1, ...summary.distribution);
  return (
    <div className="nb flex items-center gap-4 p-4">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="font-display text-[34px] font-bold leading-none tabular-nums text-[var(--ink)]">
          {formatRating(summary.avg)}
        </span>
        <Stars value={summary.avg ?? 0} size={13} />
        <span className="text-[11px] text-[var(--muted)]">{t("reviews.count", { n: summary.count })}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = summary.distribution[star - 1] ?? 0;
          return (
            <div
              key={star}
              className="flex items-center gap-2"
              aria-label={t("reviews.distAria", { star, n })}
              role="img"
            >
              <span className="font-display w-3 text-right text-[11px] font-semibold tabular-nums text-[var(--muted)]" aria-hidden>
                {star}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
                <span
                  className="block h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </span>
              <span className="w-6 text-right text-[11px] tabular-nums text-[var(--faint)]" aria-hidden>
                {n}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewItem({ review }: { review: PublicReview }) {
  const t = useT();
  const author = review.author?.trim() || t("reviews.anonymous");
  return (
    <li className="nb p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-[14px] font-bold text-[var(--ink)]">{author}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Stars value={review.rating} size={13} />
            <span className="text-[11px] text-[var(--faint)]">
              {formatDate(review.publishedAt ?? review.createdAt)}
            </span>
          </div>
        </div>
      </div>
      {review.variantName && (
        <p className="mt-2 text-[12px] text-[var(--muted)]">
          {t("reviews.variant", { name: review.variantName })}
        </p>
      )}
      <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-[#C9C9CF]">
        {review.text}
      </p>
      {review.adminReply && <ShopReply text={review.adminReply} />}
    </li>
  );
}

/** "Відповідь магазину" block, shared with the "My reviews" screen. */
export function ShopReply({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="mt-3 rounded-[var(--r)] border-l-2 border-[var(--accent)] bg-[var(--surface-2)] px-3 py-2.5">
      <p className="font-display flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-hi)]">
        <Store className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        {t("reviews.shopReply")}
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed text-[var(--ink)]">{text}</p>
    </div>
  );
}
