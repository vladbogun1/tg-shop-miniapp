package com.maxsolch.shop.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * A lot of stock (V74), for money only: units leave the oldest lot first (FIFO). The shop still sells
 * from {@code products.stock}; the ledger keeps {@code Σ qtyLeft} equal to it.
 */
@Getter
@Setter
@Entity
@Table(name = "stock_lots")
public class StockLot {

    public enum Kind {
        /** On the shelf before the ledger existed; cost unknown unless typed later. */
        OPENING,
        /** An arrival of a batch line: cost = purchase × rate + share of the batch expenses. */
        BATCH,
        /** The admin raised the stock by hand. */
        MANUAL
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;

    @Column(name = "kind", nullable = false, length = 8)
    private String kind;

    @Column(name = "batch_item_id")
    private Long batchItemId;

    @Column(name = "qty_in", nullable = false)
    private int qtyIn;

    @Column(name = "qty_left", nullable = false)
    private int qtyLeft;

    /** OPENING / MANUAL: the cost the admin typed, UAH kopecks per unit (null = unknown). */
    @Column(name = "unit_cost_minor")
    private Long unitCostMinor;

    /** Set by Hibernate on insert (the domain does not read the clock). */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public boolean batch() {
        return Kind.BATCH.name().equals(kind);
    }
}
