import type { Schemas } from "@shop/core/api/schemas";

export type ReviewStatus = Schemas["AdminReview"]["status"];

/** Filter of the list: one status or everything. */
export type ReviewFilter = ReviewStatus | "ALL";

/** Отзыв в админке: пустые поля — null, статус — закрытое множество (в схеме бэкенда). */
export type AdminReview = Schemas["AdminReview"];
export type AdminReviewPage = Schemas["AdminPage"];

export interface ReviewListParams {
  status: ReviewFilter;
  productId?: string | null;
  /** Поиск: текст отзыва, имя покупателя, название товара, № заказа. */
  q?: string;
  /** Оценки 1..5; пусто — любые. */
  ratings?: number[];
  /** Только без публичного ответа магазина. */
  unanswered?: boolean;
  page: number;
  size?: number;
}

/** Фильтры сверх статуса и товара: то, что бэкенд умеет искать. */
export interface ReviewExtraFilters {
  q: string;
  ratings: number[];
  unanswered: boolean;
}

export type ReviewAction = "publish" | "hide" | "reply" | "delete";
