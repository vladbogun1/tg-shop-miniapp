package com.maxsolch.shop.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

import java.time.Instant;

/**
 * One amount that came in or went out for an order (V68), and through which channel. The order's
 * {@code received_minor} / {@code refunded_minor} stay the running totals; every change to them
 * writes one of these, so the totals can always be explained line by line.
 */
@Getter
@Entity
@Table(name = "order_money_movements")
public class OrderMoneyMovement {

    public enum Kind {
        /** Money in: adds to received. */
        PAYMENT,
        /** Money given back: adds to refunded. */
        REFUND,
        /** Kept by the shop on purpose (prepayment covering a refused parcel's delivery); totals unchanged. */
        RETAINED,
        /** Signed fix of received (the admin corrected the amount). */
        CORRECTION
    }

    public enum Channel {
        MONO, NP_COD, NP_PAYMENT_CONTROL, CARD_TRANSFER, CASH, NP_CLAIM, OTHER,
        /** Paid value moved between an order and its exchange replacement (V69): no real money. */
        EXCHANGE,
        /** Money moved from a merged order to the one it was merged into (V71): no real money. */
        MERGE
    }

    public enum Source {
        AUTO, ADMIN, BACKFILL
    }

    /** For JPA. */
    protected OrderMoneyMovement() {
    }

    /** A new journal line, as of {@code now}; text columns are cut to their width by the caller. */
    public static OrderMoneyMovement of(byte[] orderId, Kind kind, Channel channel, long amountMinor, Source source,
                                        Instant now, String adminName, String note, String invoiceExtId) {
        OrderMoneyMovement m = new OrderMoneyMovement();
        m.orderId = orderId;
        m.kind = kind.name();
        m.channel = channel.name();
        m.amountMinor = amountMinor;
        m.occurredAt = now;
        m.createdAt = now;
        m.source = source.name();
        m.adminName = adminName;
        m.note = note;
        m.invoiceExtId = invoiceExtId;
        return m;
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "order_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] orderId;

    @Column(name = "kind", nullable = false, length = 16)
    private String kind;

    @Column(name = "channel", nullable = false, length = 24)
    private String channel;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "admin_name", length = 255)
    private String adminName;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "invoice_ext_id", length = 64)
    private String invoiceExtId;

    @Column(name = "source", nullable = false, length = 16)
    private String source;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

}
