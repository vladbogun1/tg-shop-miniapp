"use client";

import { Eye, EyeOff, MessageSquareReply, Trash2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import type { AdminReview, ReviewAction } from "../model/types";

export function ReviewActions({
  review: r,
  busy,
  canDelete,
  onPublish,
  onHide,
  onReply,
  onDelete,
}: {
  review: AdminReview;
  busy: ReviewAction | null;
  canDelete: boolean;
  onPublish: () => void;
  onHide: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
      {r.status !== "PUBLISHED" && (
        <Button
          variant="surface"
          size="sm"
          className="!border-[rgba(255,102,0,.45)] !bg-[var(--accent-soft)] !text-[var(--accent-hi)] hover:!border-[var(--accent)]"
          loading={busy === "publish"}
          disabled={!!busy}
          icon={<Eye className="h-4 w-4" />}
          onClick={onPublish}
        >
          Опубликовать
        </Button>
      )}
      {r.status !== "HIDDEN" && (
        <Button
          variant="outline"
          size="sm"
          loading={busy === "hide"}
          disabled={!!busy}
          icon={<EyeOff className="h-4 w-4" />}
          onClick={onHide}
        >
          Скрыть
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!!busy}
        icon={<MessageSquareReply className="h-4 w-4" />}
        onClick={onReply}
      >
        {r.adminReply ? "Изменить ответ" : "Ответить"}
      </Button>
      {canDelete ? (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto hover:text-[var(--danger-ink)]"
          loading={busy === "delete"}
          disabled={!!busy}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={onDelete}
        >
          Удалить
        </Button>
      ) : (
        <span className="ml-auto text-[12px] text-[var(--text-faint)]" title="Удалить отзыв навсегда может только главный админ">
          Удаляет главный админ
        </span>
      )}
    </div>
  );
}
