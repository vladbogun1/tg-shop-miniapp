package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "product_variants")
public class ProductVariant {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    @Column(name = "stock", nullable = false)
    private int stock = 0;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    /** Shipping weight, g (V98); null = inherit (variant → product → category → delivery settings). */
    @Column(name = "weight_g")
    private Integer weightG;

    /** Package length / width / height, mm (V98); null = inherit like the weight. */
    @Column(name = "length_mm")
    private Integer lengthMm;

    @Column(name = "width_mm")
    private Integer widthMm;

    @Column(name = "height_mm")
    private Integer heightMm;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    /** A new variant of {@code owner}; the caller adds it to the owner's list. The id is made on insert. */
    public static ProductVariant of(Product owner, String name) {
        ProductVariant v = new ProductVariant();
        v.product = owner;
        v.name = name;
        return v;
    }

    /** Fixes the id before the first save (imports, tests); a saved variant keeps its id. */
    public void assignId(byte[] newId) {
        this.id = newId;
    }

    public void attachTo(Product owner) {
        this.product = owner;
    }

    public void rename(String newName) {
        this.name = newName;
    }

    public void reorder(int newSortOrder) {
        this.sortOrder = newSortOrder;
    }

    /** The counter only; the product's rollup is kept by {@link Product#syncStockFromVariants()}. */
    public void changeStock(int newStock) {
        this.stock = newStock;
    }

    /** Weight (g) and box (mm) for Nova Poshta waybills; null = inherit. Checked by {@code ParcelSizes}. */
    public void changeParcelSize(Integer weightG, Integer lengthMm, Integer widthMm, Integer heightMm) {
        this.weightG = weightG;
        this.lengthMm = lengthMm;
        this.widthMm = widthMm;
        this.heightMm = heightMm;
    }
}
