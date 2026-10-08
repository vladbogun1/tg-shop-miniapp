package com.maxsolch.shop.domain;

import com.maxsolch.shop.catalog.CardStatus;
import com.maxsolch.shop.catalog.ProductCondition;
import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "products")
public class Product {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    /** URL key for the public site ({@code /product/<slug>}), unique. See SlugService. */
    @Column(name = "slug", nullable = false, length = 160)
    private String slug;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "price_minor", nullable = false)
    private long priceMinor;

    /** "Old" (struck-through) price on the site; shown only when greater than the price. */
    @Column(name = "compare_at_minor")
    private Long compareAtMinor;

    @Column(name = "seo_title", length = 255)
    private String seoTitle;

    @Column(name = "seo_description", length = 512)
    private String seoDescription;

    /** Article number (V36), unique when set; null = the site uses the id. */
    @Column(name = "sku", length = 64)
    private String sku;

    @Column(name = "currency", nullable = false, length = 8)
    private String currency = "UAH";

    @Column(name = "stock", nullable = false)
    private int stock = 0;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "archived", nullable = false)
    private boolean archived = false;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    /**
     * Average of the published reviews (V44), null while there are none. Written only by
     * {@code ReviewStore.recomputeRating} with SQL — the entity never writes it back.
     */
    @Column(name = "rating_avg", precision = 3, scale = 2, insertable = false, updatable = false)
    private java.math.BigDecimal ratingAvg;

    /** Number of published reviews (V44); maintained like {@link #ratingAvg}. */
    @Column(name = "rating_count", nullable = false, insertable = false, updatable = false)
    private int ratingCount = 0;

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC, id ASC")
    private List<ProductImage> images = new ArrayList<>();

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<ProductVariant> variants = new ArrayList<>();

    // ---- Catalog v2 (V52). The legacy tags / product_tags / products.brand are no longer mapped. ----

    /** Leaf category (docs/CATALOG-SPECS.md); null = not categorised yet. */
    @Column(name = "category_id", columnDefinition = "BINARY(16)")
    private byte[] categoryId;

    @Column(name = "brand_id", columnDefinition = "BINARY(16)")
    private byte[] brandId;

    @Enumerated(EnumType.STRING)
    @Column(name = "`condition`", nullable = false)
    private ProductCondition condition = ProductCondition.NEW;

    /** Reason of the markdown / state of a used item (Russian source; uk/en via PRODUCT condition_note). */
    @Column(name = "condition_note", length = 255)
    private String conditionNote;

    /** Characteristics: attribute key → value, validated by SpecsValidator on every write. */
    @Column(name = "specs", columnDefinition = "JSON")
    private String specsJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_status", nullable = false)
    private CardStatus cardStatus = CardStatus.DRAFT;

    /** 0..100, overall confidence of the last AI import. */
    @Column(name = "card_confidence", columnDefinition = "TINYINT")
    private Integer cardConfidence;

    /** {fields:{key:{c,src}}, sources, notes, model, importedAt, reviewedAt, reviewedBy}. */
    @Column(name = "card_meta", columnDefinition = "JSON")
    private String cardMetaJson;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
