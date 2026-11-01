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
  page: number;
  size?: number;
}

export type ReviewAction = "publish" | "hide" | "reply" | "delete";
