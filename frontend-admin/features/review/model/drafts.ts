"use client";

import { useCallback, useState } from "react";
import type { AdminReview } from "./types";

/**
 * Черновики ответов магазина по id отзыва — в памяти страницы. Переход к другому отзыву, «Опубликовать» и
 * автопереход их не теряют; точка «черновик» в очереди показывает, что ответ ещё не сохранён.
 */
export function useReplyDrafts() {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const set = useCallback((id: number, text: string) => setDrafts((d) => ({ ...d, [id]: text })), []);
  return { drafts, set };
}

/** Что показать в поле: черновик, а если его нет — сохранённый ответ. */
export function replyValue(r: AdminReview, drafts: Record<number, string>): string {
  return drafts[r.id] ?? r.adminReply ?? "";
}

/** Есть несохранённая правка ответа. */
export function hasUnsavedReply(r: AdminReview, drafts: Record<number, string>): boolean {
  const d = drafts[r.id];
  return d !== undefined && d.trim() !== (r.adminReply ?? "").trim();
}
