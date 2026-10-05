/**
 * «Отзывы» (Phase C, V44) — admin moderation endpoints. Kept apart from lib/api.ts so parallel
 * work on that file does not collide. Same http client, same error type.
 */
import type { AdminReview, AdminReviewPage, ReviewStatus } from "@shop/shared";
import { apiDelete, apiGet, apiPost } from "./api";

export type { AdminReview, AdminReviewPage, ReviewStatus };

/** Filter of the list: one status or everything. */
export type ReviewFilter = ReviewStatus | "ALL";

export const REVIEW_FILTERS: ReviewFilter[] = ["PENDING", "PUBLISHED", "HIDDEN", "ALL"];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "на модерации",
  PUBLISHED: "опубликован",
  HIDDEN: "скрыт",
};

export const REVIEWS_PAGE_SIZE = 30;

export interface ReviewListParams {
  status: ReviewFilter;
  productId?: string | null;
  page: number;
  size?: number;
}

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
  /** The first published review of an order may issue the customer a personal bonus code (server decides). */
  publish: (id: number) => apiPost<AdminReview>(`/api/admin/reviews/${id}/publish`),
  hide: (id: number) => apiPost<AdminReview>(`/api/admin/reviews/${id}/hide`),
  /** Blank text removes the reply. */
  reply: (id: number, text: string) => apiPost<AdminReview>(`/api/admin/reviews/${id}/reply`, { text }),
  remove: (id: number) => apiDelete<void>(`/api/admin/reviews/${id}`),
};

export const REVIEWS_QUERY_KEY = ["admin", "reviews"] as const;
