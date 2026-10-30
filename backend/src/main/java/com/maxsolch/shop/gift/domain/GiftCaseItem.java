package com.maxsolch.shop.gift.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A prize of a gift case (V57): a product, or a discount (a personal promo code issued when the case
 * is opened). Each prize belongs to one tier; its chance is {@code weight} / the weights of the
 * tier's prizes that can drop now (products in stock, discounts always).
 */
@Getter
@Setter
@Entity
@Table(name = "gift_case_items")
public class GiftCaseItem {

    /** Frame colour of the prize, CS style (grey-blue → blue → purple → red → gold). */
    public enum Rarity { COMMON, RARE, EPIC, LEGENDARY, GOLD }

    /** What drops: a product (a line at price 0 in the order) or a discount on the next order. */
    public enum Kind { PRODUCT, DISCOUNT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "tier", nullable = false, length = 8)
    private GiftCaseTier.Tier tier = GiftCaseTier.Tier.SILVER;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 8)
    private Kind kind = Kind.PRODUCT;

    /** The prize product (kind PRODUCT); null for a discount. */
    @Column(name = "product_id", columnDefinition = "BINARY(16)")
    private byte[] productId;

    /** Discount prize: percent off the next order (wins over {@link #discountUah} when both are set). */
    @Column(name = "discount_percent", nullable = false)
    private int discountPercent = 0;

    /** Discount prize: hryvnias off the next order. */
    @Column(name = "discount_uah", nullable = false)
    private int discountUah = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "rarity", nullable = false, length = 16)
    private Rarity rarity = Rarity.COMMON;

    @Column(name = "weight", nullable = false)
    private int weight = 10;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public boolean isDiscount() {
        return kind == Kind.DISCOUNT;
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
