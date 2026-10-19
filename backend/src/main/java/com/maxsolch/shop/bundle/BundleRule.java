package com.maxsolch.shop.bundle;

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

/** «К товару категории source предлагать товары категории target» (V57); subcategories match too. */
@Getter
@Setter
@Entity
@Table(name = "bundle_rules")
public class BundleRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "source_category_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] sourceCategoryId;

    @Column(name = "target_category_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] targetCategoryId;

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
