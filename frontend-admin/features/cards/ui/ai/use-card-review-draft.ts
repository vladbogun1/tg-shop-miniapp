"use client";

/**
 * Черновик проверки ответа ИИ по одной карточке — общий для встроенного ИИ и ручного пути через ChatGPT: значения,
 * поправленные человеком (и какие именно строки), поправленные переводы uk/en, отмеченные фото и ручной выбор «Сразу в «Готово»». Новый разбор
 * ответа (другой ответ, обновилась схема) начинает черновик заново.
 */
import { useState } from "react";
import { editReviewValue } from "../../model/ai-card";
import type { ReviewChoices } from "../../model/review-choice";
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

/** `choices` — категории и бренды каталога для выбора в строках «Категория» и «Бренд» (пока не загружены — не правятся). */
export function useCardReviewDraft(base: ProductReview | null, choices?: ReviewChoices) {
  const [st, setSt] = useState<Edits>(() => fresh(base));
  const [photos, setPhotos] = useState<string[] | null>(null);
  // null — автоматически: «Готово», если ИИ уверен (autoReady), иначе «Проверить».
  const [markReady, setMarkReady] = useState<boolean | null>(null);
  let cur = st;
  if (st.base !== base) {
    cur = fresh(base);
    setSt(cur);
  }

  /** Правка значения строки ревью: текст ошибки или новый разбор (строка помечена «изменено вами»). */
  function edit(key: string, value: string): { error: string } | { error: null; review: ProductReview } {
    if (!cur.review) return { error: "Нет разбора ответа" };
    const out = editReviewValue(cur.review, key, value, choices);
    if (out.error) return { error: out.error };
    setSt({ base: cur.base, review: out.review, edited: new Set(cur.edited).add(key) });
    return { error: null, review: out.review };
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
