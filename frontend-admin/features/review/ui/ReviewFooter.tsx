"use client";

import { Eye, EyeOff, MessageSquareReply, Trash2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { actionsFor } from "../model/moderation";
import type { AdminReview, ReviewAction } from "../model/types";

/**
 * Действия с открытым отзывом по матрице статусов: «Опубликовать» (нет у опубликованного), «Скрыть» (нет у скрытого),
 * «Ответить / Изменить ответ» (ведёт к полю), «Удалить» (только главный админ; остальным — подпись).
 */
export function ReviewFooter({
  review: r,
  busy,
  canDelete,
  hotkeys,
  onPublish,
  onHide,
  onReply,
  onDelete,
}: {
  review: AdminReview;
  busy: ReviewAction | null;
  canDelete: boolean;
  /** Показывать подсказки клавиш (ноутбук). */
  hotkeys: boolean;
  onPublish: () => void;
  onHide: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const can = actionsFor(r.status, canDelete);
  const key = (k: string) => (hotkeys ? <kbd className="ml-1.5 rounded border border-current px-1 text-[10px] opacity-60">{k}</kbd> : null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.remove ? (
        <Button
          variant="ghost"
          size="sm"
          className="hover:text-[var(--danger-ink)]"
          loading={busy === "delete"}
          disabled={!!busy}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={onDelete}
        >
          Удалить{key("Del")}
        </Button>
      ) : (
        <span className="text-[12px] text-[var(--text-faint)]" title="Удалить отзыв навсегда может только главный админ">
          Удаляет главный админ
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!!busy} icon={<MessageSquareReply className="h-4 w-4" />} onClick={onReply}>
          {r.adminReply ? "Изменить ответ" : "Ответить"}
          {key("R")}
        </Button>
        {can.hide && (
          <Button variant="outline" size="sm" loading={busy === "hide"} disabled={!!busy} icon={<EyeOff className="h-4 w-4" />} onClick={onHide}>
            Скрыть{key("H")}
          </Button>
        )}
        {can.publish && (
          <Button
            variant="surface"
            size="sm"
            className="!border-[rgba(255,102,0,.45)] !bg-[var(--accent-soft)] !text-[var(--accent-hi)] hover:!border-[var(--accent)]"
            loading={busy === "publish"}
            disabled={!!busy}
            icon={<Eye className="h-4 w-4" />}
            onClick={onPublish}
          >
            Опубликовать{key("P")}
          </Button>
        )}
      </div>
    </div>
  );
}
