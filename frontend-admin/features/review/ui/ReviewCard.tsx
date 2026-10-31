"use client";

/**
 * One review on «Отзывы»: stars + status, text, who wrote it (public signature + the customer's
 * name), product (opens the editor) + variant, order (opens over the page), dates, the shop's
 * public reply, and the actions: Опубликовать · Скрыть · Ответить (inline) · Удалить.
 */
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { riseItem } from "@/lib/motion";
import { formatDateTime } from "@/lib/orders";
import { REVIEW_STATUS_LABEL } from "../model/filters";
import type { AdminReview, ReviewAction, ReviewStatus } from "../model/types";
import { ReviewActions } from "./ReviewActions";
import { ReviewMeta } from "./ReviewMeta";
import { ReplyEditor } from "./ReplyEditor";

const STATUS_TONE: Record<ReviewStatus, string> = {
  PENDING: "var(--warn)",
  PUBLISHED: "var(--ok)",
  HIDDEN: "var(--text-muted)",
};

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Оценка ${rating} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            "h-4 w-4",
            i <= rating ? "fill-[var(--accent)] text-[var(--accent)]" : "text-[var(--text-faint)] opacity-50"
          )}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}

export function ReviewCard({
  review: r,
  busy,
  onPublish,
  onHide,
  onReply,
  onDelete,
  canDelete = true,
  onOpenOrder,
}: {
  review: AdminReview;
  /** The action currently running on this review (its button shows a spinner). */
  busy: ReviewAction | null;
  onPublish: () => void;
  onHide: () => void;
  /** Resolves true when the reply was saved (the editor closes then). */
  onReply: (text: string) => Promise<boolean>;
  onDelete: () => void;
  /** Deleting a review for good is the main admin's (SUPER_ADMIN) right; the others can hide it. */
  canDelete?: boolean;
  onOpenOrder: (orderId: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <motion.li variants={riseItem} className="card card-hover flex list-none flex-col gap-3 px-4 py-3.5">
      {/* Head: stars · status · dates */}
      <div className="flex flex-wrap items-center gap-2">
        <Stars rating={r.rating} />
        <span
          className={cn("chip-tint", r.status === "HIDDEN" && "!bg-[var(--surface-3)]")}
          style={{ "--chip": STATUS_TONE[r.status] } as CSSProperties}
        >
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          {REVIEW_STATUS_LABEL[r.status]}
        </span>
        <span className="ml-auto text-[12px] text-[var(--text-faint)]">
          {formatDateTime(r.createdAt)}
          {r.publishedAt && r.status === "PUBLISHED" ? ` · опубл. ${formatDateTime(r.publishedAt)}` : ""}
        </span>
      </div>

      {/* Text */}
      <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-[var(--text)]">
        {r.text || <span className="text-[var(--text-faint)]">Без текста</span>}
      </p>

      <ReviewMeta review={r} onOpenOrder={onOpenOrder} />

      {/* Shop's public reply */}
      {r.adminReply && !editing && (
        <div className="card-2 rounded-[var(--r-md)] border-l-2 border-l-[var(--accent)] px-3 py-2 text-[13px] leading-snug">
          <div className="field-label !text-[10.5px]">
            Ответ магазина{r.adminReplyAt ? ` · ${formatDateTime(r.adminReplyAt)}` : ""}
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-[var(--text)]">{r.adminReply}</p>
        </div>
      )}

      {editing && <ReplyEditor review={r} busy={busy === "reply"} onReply={onReply} onClose={() => setEditing(false)} />}

      {!editing && (
        <ReviewActions
          review={r}
          busy={busy}
          canDelete={canDelete}
          onPublish={onPublish}
          onHide={onHide}
          onReply={() => setEditing(true)}
          onDelete={onDelete}
        />
      )}
    </motion.li>
  );
}
