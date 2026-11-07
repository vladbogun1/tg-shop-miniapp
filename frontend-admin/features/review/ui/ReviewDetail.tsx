"use client";

import type { CSSProperties, RefObject } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@shop/core/time";
import { REVIEW_STATUS_LABEL } from "../model/filters";
import type { AdminReview, ReviewAction, ReviewStatus } from "../model/types";
import { ReviewMeta } from "./ReviewMeta";
import { ReviewReply } from "./ReviewReply";
import { Stars } from "./ReviewStars";

const STATUS_TONE: Record<ReviewStatus, string> = {
  PENDING: "var(--warn)",
  PUBLISHED: "var(--ok)",
  HIDDEN: "var(--text-muted)",
};

/** Содержимое открытого отзыва: оценка, статус, даты, текст, кто · товар · заказ, ответ магазина. */
export function ReviewDetail({
  review: r,
  value,
  busy,
  canPublish,
  textareaRef,
  onChange,
  onSave,
  onSaveAndPublish,
  onOpenOrder,
}: {
  review: AdminReview;
  value: string;
  busy: ReviewAction | null;
  canPublish: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
  onSave: (text: string) => void;
  onSaveAndPublish: (text: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3" aria-label="Отзыв">
      <div className="flex flex-wrap items-center gap-2">
        <Stars rating={r.rating} />
        <span className={cn("chip-tint", r.status === "HIDDEN" && "!bg-[var(--surface-3)]")} style={{ "--chip": STATUS_TONE[r.status] } as CSSProperties}>
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          {REVIEW_STATUS_LABEL[r.status]}
        </span>
        <span className="ml-auto text-[12px] text-[var(--text-faint)]">
          {formatDateTime(r.createdAt)}
          {r.publishedAt && r.status === "PUBLISHED" ? ` · опубл. ${formatDateTime(r.publishedAt)}` : ""}
        </span>
      </div>

      <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-[var(--text)]">
        {r.text || <span className="text-[var(--text-faint)]">Без текста</span>}
      </p>

      <ReviewMeta review={r} onOpenOrder={onOpenOrder} />

      <div className="border-t border-[var(--line)] pt-3">
        <ReviewReply
          // Новое поле на каждый отзыв: фокус и выделение не переезжают с предыдущего.
          key={r.id}
          review={r}
          value={value}
          busy={busy}
          canPublish={canPublish}
          textareaRef={textareaRef}
          onChange={onChange}
          onSave={onSave}
          onSaveAndPublish={onSaveAndPublish}
        />
      </div>
    </article>
  );
}
