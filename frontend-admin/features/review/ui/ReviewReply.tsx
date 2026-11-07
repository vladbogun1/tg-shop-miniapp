"use client";

import type { RefObject } from "react";
import { Button } from "@shop/ui/admin-button";
import { Textarea } from "@/components/ui/Textarea";
import { formatDateTime } from "@shop/core/time";
import { REPLY_TEMPLATES } from "../model/moderation";
import type { AdminReview, ReviewAction } from "../model/types";

const MAX = 2000;

/**
 * Публичный ответ магазина: поле всегда на виду, чипы-заготовки над ним, «Сохранить» (только ответ),
 * «Ответить и опубликовать» (Ctrl+Enter; сначала ответ, потом публикация) и «Убрать ответ».
 * Пустое поле при уже сохранённом ответе = убрать (как в старом); при пустом поле и без ответа кнопки выключены.
 */
export function ReviewReply({
  review: r,
  value,
  busy,
  canPublish,
  textareaRef,
  onChange,
  onSave,
  onSaveAndPublish,
}: {
  review: AdminReview;
  value: string;
  busy: ReviewAction | null;
  /** Статус позволяет «Опубликовать» (не PUBLISHED). */
  canPublish: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
  /** Сохраняет ответ; пустая строка убирает его. */
  onSave: (text: string) => void;
  onSaveAndPublish: (text: string) => void;
}) {
  const text = value.trim();
  const unchanged = text === (r.adminReply ?? "").trim();
  const nothing = !text && !r.adminReply;

  function applyTemplate(t: string) {
    onChange(value.trim() ? `${value.trimEnd()}\n${t}` : t);
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || busy) return;
    e.preventDefault();
    if (canPublish && text) onSaveAndPublish(text);
    else if (!nothing && !unchanged) onSave(text);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Заготовки ответа">
        {REPLY_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTemplate(t.text)}
            className="focusable nb-press min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[12.5px] font-medium text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:min-h-11"
          >
            {t.label}
          </button>
        ))}
      </div>
      <Textarea
        ref={textareaRef}
        label={`Публичный ответ магазина${r.adminReplyAt ? ` · ${formatDateTime(r.adminReplyAt)}` : ""}`}
        rows={4}
        value={value}
        maxLength={MAX}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Спасибо за отзыв!"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tabular text-[12px] text-[var(--text-faint)]">
          {value.length} / {MAX}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {r.adminReply && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() => {
                onChange("");
                onSave("");
              }}
              className="hover:text-[var(--danger-ink)]"
            >
              Убрать ответ
            </Button>
          )}
          <Button variant="outline" size="sm" loading={busy === "reply"} disabled={!!busy || nothing || unchanged} onClick={() => onSave(text)}>
            Сохранить
          </Button>
          {canPublish && (
            <Button variant="surface" size="sm" disabled={!!busy || !text} onClick={() => onSaveAndPublish(text)} title="Ctrl+Enter">
              Ответить и опубликовать
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
