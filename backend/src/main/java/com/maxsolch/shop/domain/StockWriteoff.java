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
 * Units that left the shelf without a sale (V68): a defect from a return or an exchange, an
 * inventory count, a mis-sort, a sale outside the site. Feeds the «Списания» report.
 */
@Getter
@Setter
@Entity
@Table(name = "stock_writeoffs")
public class StockWriteoff {

    /** Why the units left the shelf. */
    public enum Reason {
        DEFECT, INVENTORY, MISSORT, SOLD_OFFLINE, OTHER
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "reason", nullable = false, length = 16)
    private String reason;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "order_id", columnDefinition = "BINARY(16)")
    private byte[] orderId;

    @Column(name = "unit_value_minor", nullable = false)
    private long unitValueMinor;

    @Column(name = "admin_name", length = 255)
    private String adminName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Of {@link #quantity}: cancelled with the return, or back on the shelf after all (V70). */
    @Column(name = "undone_qty", nullable = false)
    private int undoneQty;

    @Column(name = "undone_at")
    private Instant undoneAt;

    @Column(name = "undone_by", length = 255)
    private String undoneBy;

    @Column(name = "undone_note", length = 500)
    private String undoneNote;

    /** Units that still count as written off. */
    public int activeQty() {
        return Math.max(0, quantity - undoneQty);
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
