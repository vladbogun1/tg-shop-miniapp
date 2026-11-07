import type { AdminReview, AdminReviewPage, ReviewAction, ReviewExtraFilters, ReviewFilter, ReviewStatus } from "./types";

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

export const RATINGS = [1, 2, 3, 4, 5] as const;

export const NO_EXTRA: ReviewExtraFilters = { q: "", ratings: [], unanswered: false };

/** Нажали звезду: добавляем или убираем оценку, список всегда по возрастанию. */
export function toggleRating(ratings: number[], r: number): number[] {
  const next = ratings.includes(r) ? ratings.filter((x) => x !== r) : [...ratings, r];
  return next.sort((a, b) => a - b);
}

/** `?ratings=1,2` из ссылки → оценки 1..5 без повторов; мусор отбрасывается. */
export function parseRatings(raw: string | null): number[] {
  if (!raw) return [];
  const out = raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Сколько фильтров сверх статуса и товара включено (поиск, оценки и «Без ответа» — каждый за один). */
export function extraFilterCount(e: ReviewExtraFilters): number {
  return (e.q.trim() ? 1 : 0) + (e.ratings.length > 0 ? 1 : 0) + (e.unanswered ? 1 : 0);
}

/** Ссылка экрана: `?status=` только не по умолчанию; `?productId=`, `?q=`, `?ratings=1,2`, `?unanswered=1`, если заданы. */
export function reviewsSearch(status: ReviewFilter, productId: string | null, extra: ReviewExtraFilters = NO_EXTRA): string {
  const sp = new URLSearchParams();
  if (status !== "PENDING") sp.set("status", status);
  if (productId) sp.set("productId", productId);
  if (extra.q.trim()) sp.set("q", extra.q.trim());
  if (extra.ratings.length > 0) sp.set("ratings", extra.ratings.join(","));
  if (extra.unanswered) sp.set("unanswered", "1");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function publishedToast(hasOrder: boolean): string {
  return hasOrder
    ? "Отзыв опубликован. Если это первый отзыв по заказу, покупателю может быть отправлен бонусный промокод"
    : "Отзыв опубликован";
}

/** Название товара для чипа «Товар: …» (берётся из любого отзыва в списке); без фильтра — null. */
export function productTitleOf(items: AdminReview[], productId: string | null): string | null {
  if (!productId) return null;
  return items.find((r) => r.productId === productId)?.productTitle ?? "Товар";
}

/** Какое действие сейчас идёт именно над открытым отзывом (у остальных кнопки не крутятся). */
export function busyOn(busy: { id: number; action: ReviewAction } | null, review: AdminReview | null): ReviewAction | null {
  return review && busy && busy.id === review.id ? busy.action : null;
}
