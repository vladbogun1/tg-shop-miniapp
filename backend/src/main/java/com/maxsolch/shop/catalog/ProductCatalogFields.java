package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.web.dto.TagDto;

import java.util.List;
import java.util.Map;

/** Catalog v2 fields of a product as the DTOs carry them, resolved against a {@link CatalogSnapshot}. */
public final class ProductCatalogFields {

    private ProductCatalogFields() {
    }

    public static String categoryId(Product p) {
        return p.getCategoryId() == null ? null : UuidUtil.toString(p.getCategoryId());
    }

    public static String brandId(Product p) {
        return p.getBrandId() == null ? null : UuidUtil.toString(p.getBrandId());
    }

    /** Legacy {@code tags}: the category path root → leaf (Russian; translated by the overlay). */
    public static List<TagDto> tags(CatalogSnapshot s, String categoryId) {
        return s.path(categoryId).stream()
                .map(c -> new TagDto(c.id(), c.name(), c.slug(), c.sortOrder(), c.showInMenu()))
                .toList();
    }

    public static BrandRefDto brandRef(CatalogSnapshot s, String brandId) {
        CatalogSnapshot.BrandInfo b = s.brand(brandId);
        return b == null ? null : new BrandRefDto(b.id(), b.slug(), b.name());
    }

    public static Map<String, Object> specs(Product p) {
        return SpecsJson.readMap(p.getSpecsJson());
    }

    public static String condition(Product p) {
        return (p.getCondition() == null ? ProductCondition.NEW : p.getCondition()).name();
    }
}
