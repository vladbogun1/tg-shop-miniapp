package com.maxsolch.shop.bundle;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * Margin of a category and the discount its products may get as an add-on (V62). A subcategory's
 * row wins over its parent's; no row = the average margin {@code gift.marginPercent}.
 */
@Getter
@Setter
@Entity
@Table(name = "bundle_category_margins")
public class BundleCategoryMargin {

    @Id
    @Column(name = "category_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] categoryId;

    /** Owner's estimate, % of the price; null = the average margin. */
    @Column(name = "margin_percent")
    private Integer marginPercent;

    /** Owner's own limit of the add-on discount; null = auto-tune / «margin − safety». */
    @Column(name = "discount_percent")
    private Integer discountPercent;

    /** What the auto-tune computed last. */
    @Column(name = "auto_percent")
    private Integer autoPercent;

    @Column(name = "auto_updated_at")
    private Instant autoUpdatedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }
}
