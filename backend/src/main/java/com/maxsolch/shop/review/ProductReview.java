package com.maxsolch.shop.review;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A customer's review of one ordered product line (V44). {@code order_item_id} is unique — one
 * review per line; the order/line links survive as null when an admin deletes the order.
 */
@Getter
@Setter
@Entity
@Table(name = "product_reviews")
public class ProductReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "order_id", columnDefinition = "BINARY(16)")
    private byte[] orderId;

    @Column(name = "order_item_id")
    private Long orderItemId;

    /** The customer (telegram user id — the users table key). */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "tg_user_id")
    private Long tgUserId;

    /** "Олена К." — snapshot taken when written; empty = the apps show a localized "Покупець". */
    @Column(name = "author_name", nullable = false, length = 64)
    private String authorName = "";

    @Column(name = "rating", nullable = false)
    private int rating;

    @Column(name = "text", nullable = false, length = 4000)
    private String text;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ReviewStatus status = ReviewStatus.PENDING;

    @Column(name = "admin_reply", length = 2000)
    private String adminReply;

    @Column(name = "admin_reply_at")
    private Instant adminReplyAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}
