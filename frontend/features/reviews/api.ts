/**
 * Product reviews + review bonus (Phase C, V44) — the Mini App's wiring of the shared `@shop/customer/review`:
 * the HTTP client with the in-memory token, and the Mini App's own form limit.
 */
import { createReviewApi } from "@shop/customer/review/api";
import { apiGet, apiPost } from "@/lib/api";

export type { BonusCode, MyReview, PendingReviewLine, PublicReview, ReviewPage, ReviewStatus, ReviewSummary, SubmitReviewResult } from "@shop/core/types";
export { reviewKeys } from "@shop/customer/review/keys";
export { REVIEW_MIN_LENGTH } from "@shop/customer/review/use-review-form";
export { REVIEWS_PAGE_SIZE } from "@shop/customer/review/api";

/** The Mini App's text limit (the website allows 4000; the server has the final word). */
export const REVIEW_MAX_LENGTH = 2000;

export const reviewsApi = createReviewApi({ get: apiGet, post: apiPost });
