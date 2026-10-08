package com.maxsolch.shop.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Group of characteristics ("Сенсор и отклик"), labels in all three languages. */
@Getter
@Setter
@Entity
@Table(name = "spec_groups")
public class SpecGroup {

    @Id
    @Column(name = "`key`", nullable = false, length = 32)
    private String key;

    @Column(name = "label_ru", nullable = false, length = 64)
    private String labelRu;

    @Column(name = "label_uk", nullable = false, length = 64)
    private String labelUk;

    @Column(name = "label_en", nullable = false, length = 64)
    private String labelEn;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;
}
