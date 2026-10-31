import type { AdminReviewPage, ReviewFilter, ReviewStatus } from "./types";

export const REVIEWS_PAGE_SIZE = 30;

export const REVIEW_FILTERS: ReviewFilter[] = ["PENDING", "PUBLISHED", "HIDDEN", "ALL"];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "на модерации",
  PUBLISHED: "опубликован",
  HIDDEN: "скрыт",
};

export const FILTER_LABEL: Record<ReviewFilter, string> = {
  PENDING: "На модерации",
  PUBLISHED: "Опубликованы",
  HIDDEN: "Скрытые",
  ALL: "Все",
};

export const EMPTY_TEXT: Record<ReviewFilter, string> = {
  PENDING: "Новых отзывов на проверку нет.",
  PUBLISHED: "Опубликованных отзывов пока нет.",
  HIDDEN: "Скрытых отзывов нет.",
  ALL: "Покупатели ещё не оставили ни одного отзыва.",
};

/** `?status=` из ссылки → фильтр; незнакомое значение — undefined. */
export function parseReviewFilter(raw: string | null): ReviewFilter | undefined {
  const s = raw?.toUpperCase() as ReviewFilter | undefined;
  return s && REVIEW_FILTERS.includes(s) ? s : undefined;
}

/** Счётчик на чипе фильтра из ответа списка. */
export function countOf(data: AdminReviewPage | undefined, f: ReviewFilter): number | undefined {
  if (!data) return undefined;
  if (f === "PENDING") return data.pendingCount;
  if (f === "PUBLISHED") return data.publishedCount;
  if (f === "HIDDEN") return data.hiddenCount;
  return data.pendingCount + data.publishedCount + data.hiddenCount;
}

/** Страница опустела после действия (опубликовали последний «на модерации») → шаг назад; иначе null. */
export function pageAfterEmptied(data: AdminReviewPage | undefined, page: number): number | null {
  if (data && page > 0 && data.items.length === 0 && page >= data.totalPages) {
    return Math.max(0, data.totalPages - 1);
  }
  return null;
}

/** Ссылка экрана: `?status=` только не по умолчанию, `?productId=` если задан. */
export function reviewsSearch(status: ReviewFilter, productId: string | null): string {
  const sp = new URLSearchParams();
  if (status !== "PENDING") sp.set("status", status);
  if (productId) sp.set("productId", productId);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function publishedToast(hasOrder: boolean): string {
  return hasOrder
    ? "Отзыв опубликован. Если это первый отзыв по заказу, покупателю может быть отправлен бонусный промокод"
    : "Отзыв опубликован";
}
