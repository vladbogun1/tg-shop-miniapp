package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A catalog category (V52): a tree of at most two levels; products live only in leaves.
 * Name and SEO are the Russian source; uk/en via content_translations (CATEGORY).
 */
@Getter
@Setter
@Entity
@Table(name = "categories")
public class Category {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    /** Null = a root. Kept as a raw id: the tree is small and always read whole (CatalogDirectory). */
    @Column(name = "parent_id", columnDefinition = "BINARY(16)")
    private byte[] parentId;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    @Column(name = "slug", nullable = false, length = 160)
    private String slug;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "show_in_menu", nullable = false)
    private boolean showInMenu = true;

    /** Site tile art (mouse, keyboard, …); null = guessed from the slug by the site. */
    @Column(name = "art_kind", length = 32)
    private String artKind;

    @Column(name = "seo_title", length = 255)
    private String seoTitle;

    @Column(name = "seo_description", length = 512)
    private String seoDescription;

    @Column(name = "h1", length = 255)
    private String h1;

    @Column(name = "intro_text", columnDefinition = "TEXT")
    private String introText;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, updatable = false, insertable = false)
    private Instant updatedAt;

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

    /** Weight (g) and box (mm) for Nova Poshta waybills; null = inherit. Checked by {@code ParcelSizes}. */
    public void changeParcelSize(Integer weightG, Integer lengthMm, Integer widthMm, Integer heightMm) {
        this.weightG = weightG;
        this.lengthMm = lengthMm;
        this.widthMm = widthMm;
        this.heightMm = heightMm;
    }
}
