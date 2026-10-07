"use client";

/**
 * ACCOUNT → REVIEWS (Phase C): lines waiting for a review (with the form), "My reviews" with a
 * moderation status chip, the shop's reply and editing while still on moderation, and "My bonuses"
 * (personal review-bonus promo codes) with a copy button.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Gift, MessageSquareText, Pencil, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BonusCodeCard, ReviewForm } from "@/components/reviews/ReviewForm";
import { PendingReviewList } from "@/components/reviews/PendingReviewList";
import { ShopReply } from "@/components/reviews/ProductReviews";
import { Stars } from "@/components/reviews/Stars";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import { reviewKeys, reviewsApi, type MyReview, type ReviewStatus } from "@/lib/reviews";
import { haptic } from "@/lib/telegram";

export default function AccountReviewsPage() {
  const t = useT();
  const router = useRouter();
  const token = useAccessToken();

  const pending = useQuery({
    queryKey: reviewKeys.pending(),
    queryFn: () => reviewsApi.pending(),
    enabled: !!token,
  });
  const mine = useQuery({
    queryKey: reviewKeys.mine,
    queryFn: () => reviewsApi.mine(),
    enabled: !!token,
  });
  const bonuses = useQuery({
    queryKey: reviewKeys.bonuses,
    queryFn: () => reviewsApi.bonuses(),
    enabled: !!token,
  });

  // Keep the "waiting" section once shown: after the last review the server returns [] but the
  // card still holds the "thanks" and the bonus code.
  const [hadPending, setHadPending] = useState(false);
  if ((pending.data?.length ?? 0) > 0 && !hadPending) setHadPending(true);
  const showPending = hadPending || (pending.data?.length ?? 0) > 0;

  const loading = !token || pending.isLoading || mine.isLoading || bonuses.isLoading;
  const failed = pending.isError || mine.isError || bonuses.isError;
  const nothing =
    !loading &&
    !failed &&
    !showPending &&
    (mine.data?.length ?? 0) === 0 &&
    (bonuses.data?.length ?? 0) === 0;

  return (
    <div className="pt-2 pb-6">
      <header
        className="sticky z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 backdrop-blur-[12px]"
        style={{ top: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
      >
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => {
            haptic();
            router.push("/account");
          }}
          className="tap nb-press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <h1 className="nb-up flex-1 truncate text-[18px] font-extrabold text-[var(--ink)]">
          {t("reviews.account.title")}
        </h1>
      </header>

      {loading && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-28 rounded-[var(--r-card)]" />
          ))}
        </div>
      )}

      {!loading && failed && (
        <div className="nb hud-frame flex flex-col items-center gap-3 px-6 py-12 text-center">
          <WifiOff className="h-8 w-8 text-[var(--accent)]" strokeWidth={2.25} />
          <p className="text-[14px] text-[var(--muted)]">{t("reviews.account.error")}</p>
          <Button
            variant="accent"
            onClick={() => {
              haptic();
              void pending.refetch();
              void mine.refetch();
              void bonuses.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {nothing && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb hud-frame flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
            <MessageSquareText className="h-8 w-8" strokeWidth={2.5} />
          </span>
          <h3 className="nb-up text-[17px] font-extrabold text-[var(--ink)]">{t("reviews.account.empty.title")}</h3>
          <p className="max-w-[260px] text-[13px] text-[var(--muted)]">{t("reviews.account.empty.text")}</p>
          <Link href="/account" onClick={() => haptic()}>
            <Button variant="accent">{t("reviews.account.toOrders")}</Button>
          </Link>
        </motion.div>
      )}

      {!loading && !failed && !nothing && (
        <div className="flex flex-col gap-6">
          {showPending && (
            <section>
              <h2 className="eyebrow mb-1 px-0.5">{t("reviews.account.pending")}</h2>
              <p className="mb-3 px-0.5 text-[12px] text-[var(--muted)]">{t("reviews.order.text")}</p>
              <PendingReviewList lines={pending.data ?? []} />
            </section>
          )}

          {(mine.data?.length ?? 0) > 0 && (
            <section>
              <h2 className="eyebrow mb-3 px-0.5">{t("reviews.account.mine")}</h2>
              <div className="flex flex-col gap-3">
                {(mine.data ?? []).map((r, i) => (
                  <MyReviewCard key={r.id} review={r} index={i} />
                ))}
              </div>
            </section>
          )}

          {(bonuses.data?.length ?? 0) > 0 && (
            <section>
              <h2 className="eyebrow mb-3 flex items-center gap-2 px-0.5">
                <Gift className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                {t("reviews.account.bonuses")}
              </h2>
              <div className="flex flex-col gap-2">
                {(bonuses.data ?? []).map((b) => (
                  <BonusCodeCard key={b.code} bonus={b} />
                ))}
              </div>
              <p className="mt-2 px-0.5 text-[11px] text-[var(--faint)]">{t("reviews.bonus.howTo")}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<ReviewStatus, string> = {
  PENDING: "var(--warn)",
  PUBLISHED: "var(--ok)",
  HIDDEN: "var(--faint)",
};

function ReviewStatusChip({ status }: { status: ReviewStatus }) {
  const t = useT();
  const color = STATUS_COLOR[status];
  return (
    <span
      className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {t(`reviews.status.${status}`)}
    </span>
  );
}

function MyReviewCard({ review, index }: { review: MyReview; index: number }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.05 }}
      className="nb p-4"
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
          <Image src={review.imageUrl} alt={review.title} size={96} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold text-[var(--ink)]">{review.title}</p>
          {review.variantName && <p className="truncate text-[11px] text-[var(--muted)]">{review.variantName}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <ReviewStatusChip status={review.status} />
            <span className="text-[11px] text-[var(--faint)]">
              {formatDate(review.publishedAt ?? review.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <ReviewForm
            orderItemId={review.orderItemId}
            productId={review.productId}
            initialRating={review.rating}
            initialText={review.text}
            submitLabel={t("reviews.form.save")}
            onCancel={() => setEditing(false)}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="mt-3">
            <Stars value={review.rating} size={14} />
          </div>
          <p className="mt-1.5 whitespace-pre-line break-words text-[14px] leading-relaxed text-[#C9C9CF]">
            {review.text}
          </p>
          {review.status === "PENDING" && (
            <p className="mt-2 text-[11px] text-[var(--faint)]">{t("reviews.thanksModeration")}</p>
          )}
          {review.adminReply && <ShopReply text={review.adminReply} />}
          {review.editable && (
            <Button
              size="sm"
              className="mt-3"
              icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />}
              onClick={() => {
                haptic();
                setEditing(true);
              }}
            >
              {t("reviews.edit")}
            </Button>
          )}
        </>
      )}
    </motion.div>
  );
}
