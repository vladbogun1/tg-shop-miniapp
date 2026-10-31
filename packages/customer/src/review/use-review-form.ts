"use client";

/**
 * Состояние формы отзыва «звёзды + текст»: оценка, текст, «занято», ошибка, отправка. Разметку и тексты даёт
 * приложение; различия Mini App / сайт — в политике (`ReviewFormPolicy`), а не в двух копиях хука.
 * Повторная отправка той же строки правит МОЙ отзыв, пока он PENDING — решает сервер, форма только шлёт.
 */
import { useState } from "react";
import { ApiError } from "@shop/core/errors";
import type { SubmitReviewResult } from "@shop/core/types";
import type { ReviewApi } from "./api";

/** Серверный минимум по умолчанию (`reviews.minLength`); последнее слово за сервером, это подсказка. */
export const REVIEW_MIN_LENGTH = 10;

export interface ReviewFormPolicy {
  maxLength: number;
  /** true — длина в символах (суррогатные пары за один), false — в единицах UTF-16. */
  countCharacters: boolean;
  /** true — «Отправить» заблокирована, пока форма не заполнена (Mini App); false — проверка оценки при нажатии (сайт). */
  gateSubmit: boolean;
  /** true — вводимый текст урезается до `maxLength` в обработчике (Mini App); false — только атрибут maxLength. */
  clampInput: boolean;
}

export interface ReviewFormOptions {
  api: Pick<ReviewApi, "submit">;
  orderItemId: number;
  initialRating?: number;
  initialText?: string;
  policy: ReviewFormPolicy;
  /** Тексты ошибок: нет оценки (только при `gateSubmit: false`) и общий сбой. */
  messages: { ratingRequired: string; failed: string };
  /** Перед запросом (Mini App — тактильный отклик). */
  onStart?: () => void;
  onDone: (result: SubmitReviewResult) => void;
}

export function useReviewForm(o: ReviewFormOptions) {
  const [rating, setRating] = useState(o.initialRating ?? 0);
  const [text, setTextRaw] = useState(o.initialText ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmed = text.trim();
  const len = o.policy.countCharacters ? [...trimmed].length : trimmed.length;
  const tooShort = len < REVIEW_MIN_LENGTH;
  const canSubmit = rating >= 1 && !tooShort && !busy;

  const setText = (value: string) => setTextRaw(o.policy.clampInput ? value.slice(0, o.policy.maxLength) : value);

  async function submit() {
    if (o.policy.gateSubmit) {
      if (!canSubmit) return;
      o.onStart?.();
    } else if (!rating) {
      setErr(o.messages.ratingRequired);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await o.api.submit({ orderItemId: o.orderItemId, rating, text: trimmed });
      o.onDone(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : o.messages.failed);
    } finally {
      setBusy(false);
    }
  }

  return { rating, setRating, text, setText, busy, err, len, tooShort, canSubmit, submit };
}
