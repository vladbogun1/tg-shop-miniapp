package com.maxsolch.shop.review.domain;

import java.time.Instant;

/** What happened in the reviews, for the listeners that run after the commit (DM, push, cache reset). */
public final class ReviewEvents {

    private ReviewEvents() {
    }

    /** A review is waiting for moderation. */
    public record PendingForModeration(String productTitle, int rating, long pendingCount) {
    }

    /** The author earned a personal bonus code. */
    public record BonusIssued(Long tgUserId, String code, int percent, long maxMinor, Instant expiresAt) {
    }

    /** A product's published reviews changed, so its cached rating is stale. */
    public record RatingChanged(byte[] productId) {
    }
}
