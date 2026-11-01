package com.maxsolch.shop.review.app;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import org.springframework.lang.Nullable;

/** Wire shapes of the reviews API (public, customer, admin). Ids of products/orders are UUID strings. */
public final class ReviewDtos {

    private ReviewDtos() {
    }

    // ------------------------------------------------------------------ public

    /**
     * Rating summary of a product.
     *
     * @param distribution counts of 1★..5★, index 0 = 1★
     */
    public record Summary(@Nullable Double avg, long count, List<Long> distribution) {
    }

    /** A published review as everybody sees it. {@code author} empty = "a customer". */
    public record PublicReview(long id, String author, int rating, String text, @Nullable String variantName,
                               Instant createdAt, @Nullable Instant publishedAt, @Nullable String adminReply, @Nullable Instant adminReplyAt) {
    }

    /** {@code GET /api/public/products/{idOrSlug}/reviews}. */
    public record ReviewPage(String productId, Summary summary, List<PublicReview> items, int page, int size,
                             int totalPages, long total) {
    }

    /** One quote of the site's home-page reviews ribbon: the review plus the product it is about. */
    public record FeedReview(long id, String author, int rating, String text, @Nullable Instant publishedAt,
                             String productTitle, @Nullable String productSlug, @Nullable String imageUrl) {
    }

    /** {@code GET /api/public/reviews/latest}: shop-wide summary and the newest quotes. */
    public record ReviewFeed(Summary summary, List<FeedReview> items) {
    }

    // ------------------------------------------------------------------ customer

    /** {@code POST /api/me/reviews}: a new review of an order line, or an edit of an own PENDING one. */
    public record SubmitRequest(Long orderItemId, Integer rating, String text) {
    }

    /** A line of a delivered order still waiting for a review. */
    public record PendingLine(long orderItemId, String orderId, String productId, @Nullable String productSlug,
                              String title, @Nullable String variantName, @Nullable String imageUrl, @Nullable Instant deliveredAt) {
    }

    /** One of my reviews, with its moderation status. */
    public record MyReview(long id, long orderItemId, @Nullable String orderId, String productId, @Nullable String productSlug,
                           String title, @Nullable String variantName, @Nullable String imageUrl, int rating, String text,
                           @Schema(allowableValues = {"PENDING", "PUBLISHED", "HIDDEN"}) String status, boolean editable, @Nullable String adminReply, Instant createdAt,
                           @Nullable Instant publishedAt) {
    }

    /** {@code POST /api/me/reviews} answer: the review, and the bonus code if this publish earned one. */
    public record SubmitResult(MyReview review, Bonus bonus) {
    }

    /**
     * A personal promo code of mine.
     *
     * @param state ACTIVE | USED | EXPIRED
     */
    /**
     * A personal promo code. {@code source}: REVIEW_BONUS (for a review) or GIFT_CASE (a case prize,
     * docs/GIFT-CASE.md); {@code amountMinor} — a fixed discount when {@code percent} is 0;
     * {@code maxDiscountMinor} — the ceiling of the discount (V63, "−5% (до 100 ₴)"), 0 = none.
     */
    public record Bonus(String code, int percent, @Nullable Instant expiresAt, @Schema(allowableValues = {"ACTIVE", "USED", "EXPIRED"}) String state, @Nullable String orderId,
                        @Nullable Instant createdAt, @Nullable String source, long amountMinor, long maxDiscountMinor) {
    }

    // ------------------------------------------------------------------ admin

    /** A review row in the admin «Отзывы» list. */
    public record AdminReview(long id, @Schema(allowableValues = {"PENDING", "PUBLISHED", "HIDDEN"}) String status,
                              int rating, String text, String author,
                              String productId, @Nullable String productTitle, @Nullable String productSlug,
                              @Nullable String variantName, @Nullable String orderId, @Nullable String orderShortId,
                              @Nullable Long userId, @Nullable String customerName,
                              @Nullable String adminReply, @Nullable Instant adminReplyAt, Instant createdAt,
                              @Nullable Instant updatedAt, @Nullable Instant publishedAt) {
    }

    /** Page of the admin list with per-status counts (the filter chips). */
    public record AdminPage(List<AdminReview> items, int page, int size, int totalPages, long total,
                            long pendingCount, long publishedCount, long hiddenCount) {
    }

    /** {@code POST /api/admin/reviews/{id}/reply}; blank text removes the reply. */
    public record ReplyRequest(String text) {
    }
}
