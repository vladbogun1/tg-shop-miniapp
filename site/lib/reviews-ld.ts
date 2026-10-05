/**
 * schema.org pieces of the product JSON-LD for reviews (V44): `aggregateRating` + up to 5 `review`.
 * Returns an empty object while the product has no published reviews, so it can be spread into the
 * Product node unconditionally (Google rejects an AggregateRating with reviewCount 0).
 */
import type { ReviewPage, StorefrontProduct } from "@shop/shared";

export function reviewsLd(
  product: Pick<StorefrontProduct, "ratingAvg" | "ratingCount">,
  page: ReviewPage | null,
  customerLabel: string
): Record<string, unknown> {
  const count = page?.summary.count ?? product.ratingCount ?? 0;
  const avg = page?.summary.avg ?? product.ratingAvg ?? null;
  if (count <= 0 || avg == null) return {};
  const reviews = (page?.items ?? []).slice(0, 5).map((r) => ({
    "@type": "Review",
    author: { "@type": "Person", name: r.author?.trim() || customerLabel },
    datePublished: (r.publishedAt ?? r.createdAt).slice(0, 10),
    ...(r.text ? { reviewBody: r.text } : {}),
    reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
  }));
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Math.round(avg * 10) / 10,
      reviewCount: count,
      bestRating: 5,
      worstRating: 1,
    },
    ...(reviews.length > 0 ? { review: reviews } : {}),
  };
}
