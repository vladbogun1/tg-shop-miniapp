"use client";

/**
 * Inline editor of the shop's public reply. A single free-text field with no validation, so it stays
 * a plain useState draft (useForm would add touched-state messages that were not there before).
 */
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Textarea } from "@/components/ui/Textarea";
import type { AdminReview } from "../model/types";

export function ReplyEditor({
  review: r,
  busy,
  onReply,
  onClose,
}: {
  review: AdminReview;
  busy: boolean;
  /** Resolves true when the reply was saved (the editor closes then). */
  onReply: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(r.adminReply ?? "");

  async function save(text: string) {
    if (await onReply(text)) onClose();
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        label="Публичный ответ магазина"
        rows={3}
        value={draft}
        autoFocus
        maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Спасибо за отзыв!"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {r.adminReply && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void save("")}
            className="mr-auto hover:text-[var(--danger-ink)]"
          >
            Убрать ответ
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="accent"
          size="sm"
          loading={busy}
          disabled={!draft.trim() && !r.adminReply}
          onClick={() => void save(draft.trim())}
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}
