package com.maxsolch.shop.preorder;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A customer's place in the queue for a product/variant that is out of stock (V73). The queue order is
 * {@code createdAt, id}. A live row is WAITING, HELD (units kept for them until {@code holdUntil}) or
 * NOTIFIED (an «everybody at once» arrival told them); the rest are history.
 */
@Getter
@Setter
@Entity
@Table(name = "preorder_subscriptions")
public class PreorderSubscription {

    public enum Status {
        WAITING, HELD, NOTIFIED, BOUGHT, EXPIRED, CANCELLED;

        public boolean live() {
            return this == WAITING || this == HELD || this == NOTIFIED;
        }
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    /** users.telegram_user_id. */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;

    @Column(name = "qty", nullable = false)
    private int qty = 1;

    @Column(name = "status", nullable = false, length = 12)
    private String status = Status.WAITING.name();

    @Column(name = "batch_id")
    private Long batchId;

    @Column(name = "held_qty", nullable = false)
    private int heldQty;

    @Column(name = "hold_until")
    private Instant holdUntil;

    @Column(name = "reminded_at")
    private Instant remindedAt;

    /** MINIAPP | WEB. */
    @Column(name = "source", length = 16)
    private String source;

    @Column(name = "order_id", columnDefinition = "BINARY(16)")
    private byte[] orderId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "notified_at")
    private Instant notifiedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "close_reason", length = 255)
    private String closeReason;

    public Status statusEnum() {
        return Status.valueOf(status);
    }

    /** Leaves the queue: no units kept any more. */
    public void close(Status to, String reason, Instant at) {
        status = to.name();
        heldQty = 0;
        holdUntil = null;
        closedAt = at;
        closeReason = reason;
    }
}
