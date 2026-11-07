"use client";

import type { RefObject } from "react";
import { Modal } from "@shop/ui/overlay";
import { actionsFor } from "../model/moderation";
import { replyValue } from "../model/drafts";
import type { AdminReview, ReviewAction } from "../model/types";
import { ReviewDetail } from "./ReviewDetail";
import { ReviewFooter } from "./ReviewFooter";

export interface ReviewPaneOps {
  publish: (r: AdminReview) => void;
  hide: (r: AdminReview) => void;
  remove: (r: AdminReview) => void;
  saveReply: (r: AdminReview, text: string) => void;
  replyAndPublish: (r: AdminReview, text: string) => void;
}

/**
 * Открытый отзыв: на ноутбуке — панель справа (с липкой шапкой экрана), на телефоне — шторка поверх списка
 * (подвал с действиями под большим пальцем).
 */
export function ReviewPane({
  review,
  desktop,
  drafts,
  busy,
  canDelete,
  textareaRef,
  ops,
  onDraft,
  onOpenOrder,
  onClose,
}: {
  review: AdminReview | null;
  desktop: boolean;
  drafts: Record<number, string>;
  busy: ReviewAction | null;
  canDelete: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  ops: ReviewPaneOps;
  onDraft: (id: number, text: string) => void;
  onOpenOrder: (orderId: string) => void;
  onClose: () => void;
}) {
  const detail = review && (
    <ReviewDetail
      review={review}
      value={replyValue(review, drafts)}
      busy={busy}
      canPublish={actionsFor(review.status, false).publish}
      textareaRef={textareaRef}
      onChange={(t) => onDraft(review.id, t)}
      onSave={(text) => ops.saveReply(review, text)}
      onSaveAndPublish={(text) => ops.replyAndPublish(review, text)}
      onOpenOrder={onOpenOrder}
    />
  );
  const footer = review && (
    <ReviewFooter
      review={review}
      busy={busy}
      canDelete={canDelete}
      hotkeys={desktop}
      onPublish={() => ops.publish(review)}
      onHide={() => ops.hide(review)}
      onReply={() => textareaRef.current?.focus()}
      onDelete={() => ops.remove(review)}
    />
  );

  if (!desktop) {
    return (
      <Modal open={!!review} onClose={onClose} title={review?.author?.trim() || "Отзыв"} footer={footer}>
        {detail}
      </Modal>
    );
  }
  return (
    <section className="panel flex min-w-0 flex-col gap-4 p-5 lg:sticky lg:top-[88px]" aria-label="Открытый отзыв">
      {detail}
      {footer && <div className="border-t border-[var(--line)] pt-3">{footer}</div>}
    </section>
  );
}
