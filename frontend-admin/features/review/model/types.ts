import type { Schemas } from "@shop/core/api/schemas";

export type ReviewStatus = "PENDING" | "PUBLISHED" | "HIDDEN";

/** Filter of the list: one status or everything. */
export type ReviewFilter = ReviewStatus | "ALL";

type NullableTextField =
  | "productTitle"
  | "productSlug"
  | "variantName"
  | "orderId"
  | "orderShortId"
  | "customerName"
  | "adminReply"
  | "adminReplyAt"
  | "updatedAt"
  | "publishedAt";

/** Сгенерированная схема считает все поля обязательными, а сервер присылает null — уточняем. */
export type AdminReview = Omit<Schemas["AdminReview"], NullableTextField | "status" | "userId"> & {
  status: ReviewStatus;
  userId?: number | null;
} & { [K in NullableTextField]?: string | null };

export type AdminReviewPage = Omit<Schemas["AdminPage"], "items"> & { items: AdminReview[] };

export interface ReviewListParams {
  status: ReviewFilter;
  productId?: string | null;
  page: number;
  size?: number;
}

export type ReviewAction = "publish" | "hide" | "reply" | "delete";
