import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { REVIEWS_PAGE_SIZE } from "./model/filters";
import type { AdminReview, AdminReviewPage, ReviewListParams } from "./model/types";

function qs(p: ReviewListParams): string {
  const sp = new URLSearchParams();
  sp.set("status", p.status);
  if (p.productId) sp.set("productId", p.productId);
  sp.set("page", String(p.page));
  sp.set("size", String(p.size ?? REVIEWS_PAGE_SIZE));
  return sp.toString();
}

export const reviewsApi = {
  list: (p: ReviewListParams) => apiGet<AdminReviewPage>(`/api/admin/reviews?${qs(p)}`),
  /** Первый опубликованный отзыв заказа может выдать покупателю бонусный промокод (решает сервер). */
  publish: (id: number) => apiPost<AdminReview>(`/api/admin/reviews/${id}/publish`),
  hide: (id: number) => apiPost<AdminReview>(`/api/admin/reviews/${id}/hide`),
  /** Пустой текст убирает ответ. */
  reply: (id: number, text: string) => apiPost<AdminReview>(`/api/admin/reviews/${id}/reply`, { text }),
  remove: (id: number) => apiDelete<void>(`/api/admin/reviews/${id}`),
};
