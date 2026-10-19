package com.maxsolch.shop.gift;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * What dropped from an order's gift case (V57), drawn by the server at checkout or when an admin
 * gave the case. The order keeps the status ({@code orders.gift_case_status}); a product prize is
 * also a line of the order ({@code auto_gift}, {@code case_rarity}).
 */
@Getter
@Setter
@Entity
@Table(name = "order_gift_cases")
public class OrderGiftCase {

    @Id
    @Column(name = "order_id", columnDefinition = "BINARY(16)")
    private byte[] orderId;

    @Column(name = "tier", nullable = false, length = 8)
    private String tier;

    /** The prize definition it came from (may be gone since). */
    @Column(name = "case_item_id")
    private Long caseItemId;

    /** PRODUCT | DISCOUNT ({@link GiftCaseItem.Kind}). */
    @Column(name = "kind", nullable = false, length = 8)
    private String kind;

    @Column(name = "rarity", nullable = false, length = 16)
    private String rarity;

    @Column(name = "product_id", columnDefinition = "BINARY(16)")
    private byte[] productId;

    @Column(name = "title")
    private String title;

    @Column(name = "discount_percent", nullable = false)
    private int discountPercent;

    @Column(name = "discount_amount_minor", nullable = false)
    private long discountAmountMinor;

    /** Personal code issued on opening (a discount prize) or on a swap. */
    @Column(name = "promo_code", length = 64)
    private String promoCode;

    @Column(name = "swapped_at")
    private Instant swappedAt;

    @Column(name = "swap_amount_minor", nullable = false)
    private long swapAmountMinor;

    /** Drawn with the low-margin odds: the order had a low-margin product (V63). */
    @Column(name = "low_margin", nullable = false)
    private boolean lowMargin;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public boolean isDiscount() {
        return GiftCaseItem.Kind.DISCOUNT.name().equals(kind);
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
