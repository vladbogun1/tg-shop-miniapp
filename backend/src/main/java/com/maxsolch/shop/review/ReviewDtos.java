package com.maxsolch.shop.review;

import java.time.Instant;
import java.util.List;

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
    public record Summary(Double avg, long count, List<Long> distribution) {
    }

    /** A published review as everybody sees it. {@code author} empty = "a customer". */
    public record PublicReview(long id, String author, int rating, String text, String variantName,
                               Instant createdAt, Instant publishedAt, String adminReply, Instant adminReplyAt) {
    }

    /** {@code GET /api/public/products/{idOrSlug}/reviews}. */
    public record ReviewPage(String productId, Summary summary, List<PublicReview> items, int page, int size,
                             int totalPages, long total) {
    }

    // ------------------------------------------------------------------ customer

    /** {@code POST /api/me/reviews}: a new review of an order line, or an edit of an own PENDING one. */
    public record SubmitRequest(Long orderItemId, Integer rating, String text) {
    }

    /** A line of a delivered order still waiting for a review. */
    public record PendingLine(long orderItemId, String orderId, String productId, String productSlug,
                              String title, String variantName, String imageUrl, Instant deliveredAt) {
    }

    /** One of my reviews, with its moderation status. */
    public record MyReview(long id, long orderItemId, String orderId, String productId, String productSlug,
                           String title, String variantName, String imageUrl, int rating, String text,
                           String status, boolean editable, String adminReply, Instant createdAt,
                           Instant publishedAt) {
    }

    /** {@code POST /api/me/reviews} answer: the review, and the bonus code if this publish earned one. */
    public record SubmitResult(MyReview review, Bonus bonus) {
    }

    /**
     * A personal promo code of mine.
     *
     * @param state ACTIVE | USED | EXPIRED
     */
    public record Bonus(String code, int percent, Instant expiresAt, String state, String orderId,
                        Instant createdAt) {
    }

    // ------------------------------------------------------------------ admin

    /** A review row in the admin «Отзывы» list. */
    public record AdminReview(long id, String status, int rating, String text, String author,
                              String productId, String productTitle, String productSlug, String variantName,
                              String orderId, String orderShortId, Long userId, String customerName,
                              String adminReply, Instant adminReplyAt, Instant createdAt, Instant updatedAt,
                              Instant publishedAt) {
    }

    /** Page of the admin list with per-status counts (the filter chips). */
    public record AdminPage(List<AdminReview> items, int page, int size, int totalPages, long total,
                            long pendingCount, long publishedCount, long hiddenCount) {
    }

    /** {@code POST /api/admin/reviews/{id}/reply}; blank text removes the reply. */
    public record ReplyRequest(String text) {
    }
}
