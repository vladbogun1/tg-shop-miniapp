package com.maxsolch.shop.preorder;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A «поставка» (V73): goods the shop ordered from a factory. Its lines are {@link PreorderBatchItem}s;
 * customers queue per product/variant ({@link PreorderSubscription}), the batch only tells them when.
 */
@Getter
@Setter
@Entity
@Table(name = "preorder_batches")
public class PreorderBatch {

    public enum Status {
        ORDERED, IN_TRANSIT, CUSTOMS, ARRIVED, CANCELLED;

        public boolean open() {
            return this == ORDERED || this == IN_TRANSIT || this == CUSTOMS;
        }
    }

    /** How the ETA is shown: a day, a range, «~N weeks» to {@code etaTo}, or not at all. */
    public enum EtaMode {
        DATE, RANGE, APPROX, HIDDEN
    }

    /** On arrival: holds in queue order, or a notice to everybody (first to buy wins). */
    public enum Distribution {
        QUEUE_HOLD, ALL_AT_ONCE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "supplier_id")
    private Long supplierId;

    @Column(name = "private_note", columnDefinition = "TEXT")
    private String privateNote;

    @Column(name = "public_note", length = 1000)
    private String publicNote;

    @Column(name = "status", nullable = false, length = 16)
    private String status = Status.ORDERED.name();

    @Column(name = "preorder_open", nullable = false)
    private boolean preorderOpen = true;

    @Column(name = "eta_mode", nullable = false, length = 8)
    private String etaMode = EtaMode.HIDDEN.name();

    @Column(name = "eta_from")
    private LocalDate etaFrom;

    @Column(name = "eta_to")
    private LocalDate etaTo;

    @Column(name = "hold_hours", nullable = false)
    private int holdHours = 24;

    @Column(name = "distribution", nullable = false, length = 12)
    private String distribution = Distribution.QUEUE_HOLD.name();

    @Column(name = "currency", nullable = false, length = 3)
    private String currency = "USD";

    /** UAH per 1 unit of {@link #currency}; main admin only. */
    @Column(name = "fx_rate", precision = 12, scale = 4)
    private BigDecimal fxRate;

    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, updatable = false, insertable = false)
    private Instant updatedAt;

    @Column(name = "in_transit_at")
    private Instant inTransitAt;

    @Column(name = "arrived_at")
    private Instant arrivedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    public Status statusEnum() {
        return Status.valueOf(status);
    }

    public EtaMode etaModeEnum() {
        return EtaMode.valueOf(etaMode);
    }

    public Distribution distributionEnum() {
        return Distribution.valueOf(distribution);
    }
}
