package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
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

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Getter
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
     * {@code ProductBriefs.setRating} with SQL — the entity never writes it back.
     */
    @Column(name = "rating_avg", precision = 3, scale = 2, insertable = false, updatable = false)
    private java.math.BigDecimal ratingAvg;

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
    @Column(name = "`condition`", nullable = false, length = 32)
    private ProductCondition condition = ProductCondition.NEW;

    /** Reason of the markdown / state of a used item (Russian source; uk/en via PRODUCT condition_note). */
    @Column(name = "condition_note", length = 255)
    private String conditionNote;

    /** Characteristics: attribute key → value, validated by SpecsValidator on every write. */
    @Column(name = "specs", columnDefinition = "JSON")
    private String specsJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_status", nullable = false, length = 32)
    private CardStatus cardStatus = CardStatus.DRAFT;

    /** 0..100, overall confidence of the last AI import. */
    @Column(name = "card_confidence", columnDefinition = "TINYINT")
    private Integer cardConfidence;

    /**
     * Created in the admin and never published yet (V53, «Незавершённые»). Set on create, cleared
     * when the product becomes active or is archived. Legacy hidden products are not unfinished.
     */
    @Column(name = "unfinished", nullable = false)
    private boolean unfinished = false;

    /** {fields:{key:{c,src}}, sources, notes, model, importedAt, reviewedAt, reviewedBy}. */
    @Column(name = "card_meta", columnDefinition = "JSON")
    private String cardMetaJson;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    /** The product is sold in variants (sizes, colours): their counters, not {@link #stock}, are the truth. */
    public boolean hasVariants() {
        return variants != null && !variants.isEmpty();
    }

    /** The variant with this id, or null — also for a null id and for a product without variants. */
    public ProductVariant variant(byte[] variantId) {
        if (variantId == null || variants == null) {
            return null;
        }
        return variants.stream().filter(v -> java.util.Arrays.equals(v.getId(), variantId)).findFirst().orElse(null);
    }

    /** {@link #variant(byte[])} for an id typed as text (a cart line); null, blank or malformed means none. */
    public ProductVariant variant(String variantId) {
        if (variantId == null || variantId.isBlank()) {
            return null;
        }
        try {
            return variant(UuidUtil.toBytes(variantId.trim()));
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }

    /**
     * Units that can be sold: the sum of the variants (a negative one counts as zero) when there are variants,
     * else the product's own counter. The one definition behind the cart, the catalog, the rollup and gifts;
     * units held for a pre-order queue are taken off by the caller.
     */
    public int availableUnits() {
        if (!hasVariants()) {
            return stock;
        }
        return variants.stream().mapToInt(v -> Math.max(0, v.getStock())).sum();
    }

    /**
     * The one place of the rule «a product with variants has {@code stock} = {@link #availableUnits()}». Call
     * after any change of a variant's stock or of the variant list; no-op without variants (the product's own
     * counter is then the source of truth).
     */
    public void syncStockFromVariants() {
        if (hasVariants()) {
            stock = availableUnits();
        }
    }

    /** The first picture: lowest sort order, equal ones by id (a not yet saved one last); null without pictures. */
    public String firstImageUrl() {
        if (images == null) {
            return null;
        }
        return images.stream()
                .min(java.util.Comparator.comparingInt(ProductImage::getSortOrder)
                        .thenComparing(i -> i.getId() == null ? Long.MAX_VALUE : i.getId()))
                .map(ProductImage::getUrl)
                .orElse(null);
    }

    /** A product the admin just created: hidden, a draft card, not published yet (V53, «Незавершённые»). */
    public void startAsDraft() {
        this.active = false;
        this.cardStatus = CardStatus.DRAFT;
        this.unfinished = true;
    }

    public void retitle(String newTitle) {
        this.title = newTitle;
    }

    public void redescribe(String newDescription) {
        this.description = newDescription;
    }

    public void reprice(long newPriceMinor) {
        this.priceMinor = newPriceMinor;
    }

    public void changeCurrency(String newCurrency) {
        this.currency = newCurrency;
    }

    /** The «old» (struck-through) price; null or 0 means none. */
    public void markDownFrom(Long newCompareAtMinor) {
        this.compareAtMinor = newCompareAtMinor;
    }

    public void retitleSeo(String newSeoTitle) {
        this.seoTitle = newSeoTitle;
    }

    public void redescribeSeo(String newSeoDescription) {
        this.seoDescription = newSeoDescription;
    }

    public void changeSlug(String newSlug) {
        this.slug = newSlug;
    }

    public void changeSku(String newSku) {
        this.sku = newSku;
    }

    /** The product's own counter; with variants it is {@link #syncStockFromVariants()} that sets it. */
    public void changeStock(int newStock) {
        this.stock = newStock;
    }

    /** Shown in the shop (true) or hidden (false). */
    public void showInShop(boolean shown) {
        this.active = shown;
    }

    public void archive(boolean archived) {
        this.archived = archived;
    }

    public void categorize(byte[] newCategoryId) {
        this.categoryId = newCategoryId;
    }

    public void assignBrand(byte[] newBrandId) {
        this.brandId = newBrandId;
    }

    public void changeCondition(ProductCondition newCondition) {
        this.condition = newCondition;
    }

    public void noteCondition(String newConditionNote) {
        this.conditionNote = newConditionNote;
    }

    public void changeSpecs(String newSpecsJson) {
        this.specsJson = newSpecsJson;
    }

    public void changeCardStatus(CardStatus newStatus) {
        this.cardStatus = newStatus;
    }

    public void recordCardMeta(String newCardMetaJson) {
        this.cardMetaJson = newCardMetaJson;
    }

    public void recordCardConfidence(Integer confidence) {
        this.cardConfidence = confidence;
    }

    public void markUnfinished(boolean isUnfinished) {
        this.unfinished = isUnfinished;
    }

    /** Weight (g) and box (mm) for Nova Poshta waybills; null = inherit. Checked by {@code ParcelSizes}. */
    public void changeParcelSize(Integer weightG, Integer lengthMm, Integer widthMm, Integer heightMm) {
        this.weightG = weightG;
        this.lengthMm = lengthMm;
        this.widthMm = widthMm;
        this.heightMm = heightMm;
    }
}
