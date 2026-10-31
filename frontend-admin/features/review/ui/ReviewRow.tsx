"use client";

import { useConfirm } from "@shop/ui/confirm";
import { useReviewActions } from "../queries";
import type { AdminReview } from "../model/types";
import { ReviewCard } from "./ReviewCard";

/**
 * Карточка с собственными действиями: защита от двойного нажатия у `useApiMutation` — на карточку,
 * а не на весь список, поэтому модерация двух разных отзывов подряд идёт параллельно, как и раньше.
 */
export function ReviewRow({
  review,
  canDelete,
  onOpenOrder,
}: {
  review: AdminReview;
  canDelete: boolean;
  onOpenOrder: (orderId: string) => void;
}) {
  const confirm = useConfirm();
  const { busy, run } = useReviewActions();

  async function remove() {
    const ok = await confirm({
      title: "Удалить отзыв?",
      message:
        "Отзыв исчезнет навсегда, покупатель сможет оставить новый на этот товар. Чтобы просто убрать его с витрины, лучше скройте.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    void run({ review, action: "delete" });
  }

  return (
    <ReviewCard
      review={review}
      busy={busy?.action ?? null}
      onPublish={() => void run({ review, action: "publish" })}
      onHide={() => void run({ review, action: "hide" })}
      onReply={(text) => run({ review, action: "reply", text })}
      onDelete={() => void remove()}
      canDelete={canDelete}
      onOpenOrder={onOpenOrder}
    />
  );
}
