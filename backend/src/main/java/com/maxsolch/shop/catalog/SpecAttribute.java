package com.maxsolch.shop.catalog;

import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * A characteristic of a category (null category = global). Options live in {@link SpecOption};
 * buckets (number facets) are JSON {@code [{min,max,label_ru,label_uk,label_en}]}.
 */
@Getter
@Setter
@Entity
@Table(name = "spec_attributes")
public class SpecAttribute {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "category_id", columnDefinition = "BINARY(16)")
    private byte[] categoryId;

    @Column(name = "`key`", nullable = false, length = 48)
    private String key;

    @Column(name = "label_ru", nullable = false, length = 96)
    private String labelRu;

    @Column(name = "label_uk", nullable = false, length = 96)
    private String labelUk;

    @Column(name = "label_en", nullable = false, length = 96)
    private String labelEn;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private SpecType type;

    @Column(name = "unit_ru", length = 24)
    private String unitRu;

    @Column(name = "unit_uk", length = 24)
    private String unitUk;

    @Column(name = "unit_en", length = 24)
    private String unitEn;

    @Column(name = "is_range", nullable = false)
    private boolean range;

    @Column(name = "group_key", nullable = false, length = 32)
    private String groupKey;

    @Column(name = "filterable", nullable = false)
    private boolean filterable;

    @Column(name = "comparable", nullable = false)
    private boolean comparable;

    @Column(name = "is_required", nullable = false)
    private boolean required;

    @Column(name = "highlight", nullable = false)
    private boolean highlight;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "buckets", columnDefinition = "JSON")
    private String bucketsJson;

    @Column(name = "hint", columnDefinition = "TEXT")
    private String hint;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
