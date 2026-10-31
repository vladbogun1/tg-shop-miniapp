"use client";

import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ShopReply } from "@/components/reviews/ProductReviews";
import { Stars } from "@/components/reviews/Stars";
import { Button } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";
import { formatDate } from "@/lib/format";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import type { MyReview, ReviewStatus } from "@/lib/reviews";
import { haptic } from "@/lib/telegram";

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

export function MyReviewCard({ review, index }: { review: MyReview; index: number }) {
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
