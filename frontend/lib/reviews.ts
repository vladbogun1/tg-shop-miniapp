/**
 * Product reviews + review bonus (Phase C, V44) — endpoints and query keys.
 *
 * Kept out of `lib/api.ts` on purpose: it only needs the shared HTTP client (`apiGet`/`apiPost`),
 * and a separate module keeps the review screens self-contained.
 */
import type {
  BonusCode,
  MyReview,
  PendingReviewLine,
  ReviewPage,
  SubmitReviewRequest,
  SubmitReviewResult,
} from "@shop/shared";
import { apiGet, apiPost } from "@/lib/api";

export type {
  BonusCode,
  MyReview,
  PendingReviewLine,
  PublicReview,
  ReviewPage,
  ReviewStatus,
  ReviewSummary,
  SubmitReviewResult,
} from "@shop/shared";

/** Mirrors the server default `reviews.minLength`; the server is the authority, this is a hint. */
export const REVIEW_MIN_LENGTH = 10;
export const REVIEW_MAX_LENGTH = 2000;
export const REVIEWS_PAGE_SIZE = 10;

export const reviewsApi = {
  /** Public: published reviews of a product + rating summary. `page` is 0-based. */
  productReviews: (idOrSlug: string, page = 0, size = REVIEWS_PAGE_SIZE) =>
    apiGet<ReviewPage>(
      `/api/public/products/${encodeURIComponent(idOrSlug)}/reviews?page=${page}&size=${size}`
    ),
  /** Lines of my DELIVERED orders still waiting for a review (optionally of one order). */
  pending: (orderId?: string) =>
    apiGet<PendingReviewLine[]>(
      `/api/me/reviews/pending${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`
    ),
  /** Creates a review, or re-submits my own while it is still PENDING. */
  submit: (body: SubmitReviewRequest) => apiPost<SubmitReviewResult>("/api/me/reviews", body),
  mine: () => apiGet<MyReview[]>("/api/me/reviews"),
  bonuses: () => apiGet<BonusCode[]>("/api/me/bonuses"),
};

export const reviewKeys = {
  product: (productId: string) => ["reviews", "product", productId] as const,
  pending: (orderId?: string) => ["me", "reviews", "pending", orderId ?? "all"] as const,
  pendingAll: ["me", "reviews", "pending"] as const,
  mine: ["me", "reviews", "mine"] as const,
  bonuses: ["me", "bonuses"] as const,
};
