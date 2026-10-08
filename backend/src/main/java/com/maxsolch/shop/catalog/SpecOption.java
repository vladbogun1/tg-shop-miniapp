package com.maxsolch.shop.catalog;

import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

/** One option of an enum/multi characteristic: a stable slug {@code value} + labels + aliases. */
@Getter
@Setter
@Entity
@Table(name = "spec_options")
public class SpecOption {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "attribute_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] attributeId;

    @Column(name = "value", nullable = false, length = 64)
    private String value;

    @Column(name = "label_ru", nullable = false, length = 96)
    private String labelRu;

    @Column(name = "label_uk", nullable = false, length = 96)
    private String labelUk;

    @Column(name = "label_en", nullable = false, length = 96)
    private String labelEn;

    @Column(name = "aliases", columnDefinition = "TEXT")
    private String aliases;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    public List<String> aliasList() {
        return Brand.splitLines(aliases);
    }

    public void setAliasList(List<String> list) {
        this.aliases = Brand.joinLines(list);
    }
}
