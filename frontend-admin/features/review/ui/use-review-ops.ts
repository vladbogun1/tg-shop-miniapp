"use client";

import { useConfirm } from "@shop/ui/confirm";
import { actionsFor } from "../model/moderation";
import type { AdminReview, ReviewAction } from "../model/types";
import type { ReviewPaneOps } from "./ReviewPane";

interface Deps {
  run: (v: { review: AdminReview; action: ReviewAction; text?: string }) => Promise<boolean>;
  replyAndPublish: (review: AdminReview, text: string) => Promise<boolean>;
  superAdmin: boolean;
  confirm: ReturnType<typeof useConfirm>;
}

/** Действия модерации с проверкой по матрице статусов; удаление — только главный админ и только после подтверждения. */
export function useReviewOps({ run, replyAndPublish, superAdmin, confirm }: Deps): ReviewPaneOps {
  return {
    publish: (r) => {
      if (actionsFor(r.status, superAdmin).publish) void run({ review: r, action: "publish" });
    },
    hide: (r) => {
      if (actionsFor(r.status, superAdmin).hide) void run({ review: r, action: "hide" });
    },
    remove: (r) => {
      if (!actionsFor(r.status, superAdmin).remove) return;
      void (async () => {
        const ok = await confirm({
          title: "Удалить отзыв?",
          message:
            "Отзыв исчезнет навсегда, покупатель сможет оставить новый на этот товар. Чтобы просто убрать его с витрины, лучше скройте.",
          confirmLabel: "Удалить",
          danger: true,
        });
        if (ok) await run({ review: r, action: "delete" });
      })();
    },
    saveReply: (r, text) => void run({ review: r, action: "reply", text }),
    replyAndPublish: (r, text) => void replyAndPublish(r, text),
  };
}
