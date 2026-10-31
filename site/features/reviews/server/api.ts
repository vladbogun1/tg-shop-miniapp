import "server-only";
import type { Locale } from "@shop/core/i18n";
import type { ReviewFeed, ReviewPage } from "@shop/core/types";
import { getJson, NotFoundError } from "@/lib/server-http";

/** First page of a product's published reviews (V44); null when unavailable. */
export async function getProductReviews(slug: string, locale: Locale, size = 10): Promise<ReviewPage | null> {
  try {
    return await getJson<ReviewPage>(
      `/api/public/products/${encodeURIComponent(slug)}/reviews?page=0&size=${size}`,
      locale,
      ["catalog", "reviews", `product:${slug}`]
    );
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Newest published reviews across the shop for the home-page ribbon; product titles in `locale`. */
export async function getReviewFeed(locale: Locale, size = 24): Promise<ReviewFeed> {
  return getJson<ReviewFeed>(`/api/public/reviews/latest?size=${size}`, locale, ["reviews"]);
}
