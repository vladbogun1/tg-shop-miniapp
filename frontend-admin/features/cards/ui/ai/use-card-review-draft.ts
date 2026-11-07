"use client";

/**
 * Черновик проверки ответа ИИ по одной карточке — общий для встроенного ИИ и ручного пути через ChatGPT: значения,
 * поправленные человеком (и какие именно строки), поправленные переводы uk/en, отмеченные фото и ручной выбор «Сразу в «Готово»». Новый разбор
 * ответа (другой ответ, обновилась схема) начинает черновик заново.
 */
import { useState } from "react";
import { editReviewValue } from "../../model/ai-card";
import { defaultPhotos } from "../../model/selection";
import { editText } from "../../model/review";
import type { ProductReview, TextField } from "../../model/types";
import type { TranslatedLocale } from "@shop/core/i18n";

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

  /** Правка перевода uk/en (те же проверки, что в «Переводах»): строкой ревью не считается — это не значение поля. */
  function editTranslation(field: TextField, lang: TranslatedLocale, value: string) {
    if (cur.review) setSt({ ...cur, review: editText(cur.review, field, lang, value) });
  }

  const found = cur.review?.photos ?? [];
  const chosen = (photos ?? (cur.review ? defaultPhotos(cur.review) : [])).filter((u) => found.includes(u));
  return { review: cur.review, edited: cur.edited, edit, editTranslation, photos: chosen, setPhotos, markReady, setMarkReady };
}

export type CardReviewDraft = ReturnType<typeof useCardReviewDraft>;
