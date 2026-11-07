"use client";

/**
 * Черновик проверки ответа ИИ по одной карточке — общий для встроенного ИИ и ручного пути через ChatGPT: значения,
 * поправленные человеком (и какие именно строки), отмеченные фото и ручной выбор «Сразу в «Готово»». Новый разбор
 * ответа (другой ответ, обновилась схема) начинает черновик заново.
 */
import { useState } from "react";
import { editReviewValue } from "../../model/ai-card";
import { defaultPhotos } from "../../model/selection";
import type { ProductReview } from "../../model/types";

interface Edits {
  base: ProductReview | null;
  review: ProductReview | null;
  edited: ReadonlySet<string>;
}

const fresh = (base: ProductReview | null): Edits => ({ base, review: base, edited: new Set() });

export function useCardReviewDraft(base: ProductReview | null) {
  const [st, setSt] = useState<Edits>(() => fresh(base));
  const [photos, setPhotos] = useState<string[] | null>(null);
  // null — автоматически: «Готово», если ИИ уверен (autoReady), иначе «Проверить».
  const [markReady, setMarkReady] = useState<boolean | null>(null);
  let cur = st;
  if (st.base !== base) {
    cur = fresh(base);
    setSt(cur);
  }

  /** Правка значения строки ревью: текст ошибки или null (принято, строка помечена «изменено вами»). */
  function edit(key: string, value: string): string | null {
    if (!cur.review) return "Нет разбора ответа";
    const out = editReviewValue(cur.review, key, value);
    if (out.error) return out.error;
    setSt({ base: cur.base, review: out.review, edited: new Set(cur.edited).add(key) });
    return null;
  }

  const found = cur.review?.photos ?? [];
  const chosen = (photos ?? (cur.review ? defaultPhotos(cur.review) : [])).filter((u) => found.includes(u));
  return { review: cur.review, edited: cur.edited, edit, photos: chosen, setPhotos, markReady, setMarkReady };
}

export type CardReviewDraft = ReturnType<typeof useCardReviewDraft>;
