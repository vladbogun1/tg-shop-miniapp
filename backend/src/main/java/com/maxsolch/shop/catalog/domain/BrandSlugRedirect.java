package com.maxsolch.shop.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A slug the brand used to have (V85): the site answers it with a 301 to the brand's current slug. */
@Getter
@NoArgsConstructor
@Entity
@Table(name = "brand_slug_redirects")
public class BrandSlugRedirect {

    @Id
    @Column(name = "old_slug", nullable = false, length = 160)
    private String oldSlug;

    @Column(name = "brand_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] brandId;

    public BrandSlugRedirect(String oldSlug, byte[] brandId) {
        this.oldSlug = oldSlug;
        this.brandId = brandId;
    }
}
