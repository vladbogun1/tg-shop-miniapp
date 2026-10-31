/**
 * Пути отзывов (V44) — единственное место: публичная лента отзывов товара, строки доставленных заказов, ждущие
 * отзыва, мои отзывы, отправка, бонус-коды. HTTP-клиент и способ авторизации даёт приложение: на сайте закрытые
 * вызовы оборачиваются в «обнови сессию и повтори» (`authed`); публичная лента — нет.
 */
import type { HttpClient } from "@shop/core/http";
import type { BonusCode, MyReview, PendingReviewLine, ReviewPage, SubmitReviewRequest, SubmitReviewResult } from "@shop/core/types";

/** Размер страницы публичной ленты. */
export const REVIEWS_PAGE_SIZE = 10;

export interface ReviewApi {
  /** Опубликованные отзывы товара + сводка рейтинга; `page` с нуля. */
  productReviews(idOrSlug: string, page?: number, size?: number): Promise<ReviewPage>;
  /** Строки МОИХ доставленных заказов, ждущие отзыва (при `orderId` — одного заказа). */
  pending(orderId?: string): Promise<PendingReviewLine[]>;
  mine(): Promise<MyReview[]>;
  /** Создаёт отзыв или правит свой, пока он PENDING (тот же orderItemId). 400 приходит уже локализованным. */
  submit(body: SubmitReviewRequest): Promise<SubmitReviewResult>;
  bonuses(): Promise<BonusCode[]>;
}

export function createReviewApi(
  http: Pick<HttpClient, "get" | "post">,
  authed: <T>(call: () => Promise<T>) => Promise<T> = (call) => call(),
): ReviewApi {
  return {
    productReviews: (idOrSlug, page = 0, size = REVIEWS_PAGE_SIZE) =>
      http.get<ReviewPage>(`/api/public/products/${encodeURIComponent(idOrSlug)}/reviews?page=${page}&size=${size}`),
    pending: (orderId) =>
      authed(() =>
        http.get<PendingReviewLine[]>(`/api/me/reviews/pending${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`),
      ),
    mine: () => authed(() => http.get<MyReview[]>("/api/me/reviews")),
    submit: (body) => authed(() => http.post<SubmitReviewResult>("/api/me/reviews", body)),
    bonuses: () => authed(() => http.get<BonusCode[]>("/api/me/bonuses")),
  };
}
