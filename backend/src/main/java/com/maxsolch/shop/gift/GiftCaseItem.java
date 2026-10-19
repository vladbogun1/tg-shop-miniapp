package com.maxsolch.shop.gift;

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

/** A prize of the gift case (V58): the chance is {@code weight} / the weights of the prizes in stock. */
@Getter
@Setter
@Entity
@Table(name = "gift_case_items")
public class GiftCaseItem {

    /** Frame colour of the prize, CS style (grey-blue → blue → purple → red → gold). */
    public enum Rarity { COMMON, RARE, EPIC, LEGENDARY, GOLD }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

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

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
