"use client";

/**
 * «Залиште відгук — отримайте −5%» on a DELIVERED order: the order's lines still waiting for a
 * review, each with a compact form. The bot reminder deep-links to this page (startapp=view_<id>),
 * so the form has to be right here. Renders nothing when there is nothing left to review.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MessageSquareHeart } from "lucide-react";
import { spring } from "@/lib/motion";
import { useState } from "react";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { reviewKeys, reviewsApi } from "@/lib/reviews";
import { PendingReviewList } from "./PendingReviewList";

export function OrderReviewsCard({ orderId }: { orderId: string }) {
  const t = useT();
  const token = useAccessToken();
  const { data } = useQuery({
    queryKey: reviewKeys.pending(orderId),
    queryFn: () => reviewsApi.pending(orderId),
    enabled: !!token && !!orderId,
  });
  // Keep the card once it has been shown: after the last review the server returns [] but the
  // card still holds the "thanks" and the bonus code.
  const [hadLines, setHadLines] = useState(false);
  if (data && data.length > 0 && !hadLines) setHadLines(true);
  if (!data || (!hadLines && data.length === 0)) return null;

  return (
    <motion.section
      id="reviews"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="nb scroll-mt-24 border-[color-mix(in_srgb,var(--accent)_35%,var(--line))] p-4"
    >
      <h3 className="font-display flex items-center gap-2 text-[15px] font-bold text-[var(--ink)]">
        <MessageSquareHeart className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
        {t("reviews.order.title")}
      </h3>
      <p className="mt-1 mb-3 text-[12px] text-[var(--muted)]">{t("reviews.order.text")}</p>
      <PendingReviewList lines={data} />
    </motion.section>
  );
}
