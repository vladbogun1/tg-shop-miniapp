package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * One run of the return wizard or one exchange on an order (V70): what it did, so it can be
 * cancelled when the customer changes their mind. Never deleted — a cancellation is stamped on it.
 */
@Getter
@Setter
@Entity
@Table(name = "order_returns")
public class OrderReturn {

    public enum Kind {
        RETURN, EXCHANGE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "order_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] orderId;

    @Column(name = "kind", nullable = false, length = 16)
    private String kind = Kind.RETURN.name();

    @Column(name = "exchange_id")
    private Long exchangeId;

    @Column(name = "refund_minor", nullable = false)
    private long refundMinor;

    @Column(name = "refund_channel", length = 24)
    private String refundChannel;

    @Column(name = "mono_refund_minor", nullable = false)
    private long monoRefundMinor;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "admin_name", length = 255)
    private String adminName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by", length = 255)
    private String cancelledBy;

    @Column(name = "cancel_note", length = 500)
    private String cancelNote;

    @Column(name = "debt_minor", nullable = false)
    private long debtMinor;

    @Column(name = "debt_paid_at")
    private Instant debtPaidAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
