package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Characterisation of the product's stock rules (the «has variants → stock = sum of variants» family) before
 * they were gathered into one place: what a product with and without variants reports as units for sale,
 * how the rollup is computed, how a variant is found and which picture is the first.
 */
class ProductStockRulesTest {

    private static Product product(int stock) {
        Product p = new Product();
        ReflectionTestUtils.setField(p, "id", UuidUtil.randomBytes());
        ReflectionTestUtils.setField(p, "variants", new ArrayList<>());
        ReflectionTestUtils.setField(p, "images", new ArrayList<>());
        p.changeStock(stock);
        return p;
    }

    private static ProductVariant variant(Product p, int stock) {
        ProductVariant v = new ProductVariant();
        v.assignId(UuidUtil.randomBytes());
        v.attachTo(p);
        v.rename("v");
        v.changeStock(stock);
        p.getVariants().add(v);
        return v;
    }

    @Test
    void withoutVariantsTheProductsOwnCounterIsTheUnitsForSale() {
        Product p = product(5);
        assertThat(p.hasVariants()).isFalse();
        assertThat(p.availableUnits()).isEqualTo(5);
    }

    @Test
    void withVariantsUnitsForSaleAreTheSumOfThemAndANegativeVariantCountsAsZero() {
        Product p = product(99);
        variant(p, 3);
        variant(p, -2);
        variant(p, 4);
        assertThat(p.hasVariants()).isTrue();
        assertThat(p.availableUnits()).isEqualTo(7);
    }

    @Test
    void rollupIsTheSameSumAndNeverNegative() {
        Product p = product(99);
        variant(p, 3);
        variant(p, 4);
        p.syncStockFromVariants();
        assertThat(p.getStock()).isEqualTo(7);

        Product negative = product(99);
        variant(negative, -2);
        negative.syncStockFromVariants();
        assertThat(negative.getStock()).isZero();
    }

    @Test
    void rollupLeavesAProductWithoutVariantsAlone() {
        Product p = product(5);
        p.syncStockFromVariants();
        assertThat(p.getStock()).isEqualTo(5);
    }

    @Test
    void variantIsFoundByIdOrIsNull() {
        Product p = product(0);
        ProductVariant a = variant(p, 1);
        variant(p, 2);
        assertThat(p.variant(a.getId())).isSameAs(a);
        assertThat(p.variant(UuidUtil.randomBytes())).isNull();
        assertThat(p.variant((byte[]) null)).isNull();
        assertThat(product(1).variant(a.getId())).isNull();
    }

    @Test
    void variantIsFoundByTheTextIdToo() {
        Product p = product(0);
        ProductVariant a = variant(p, 1);
        assertThat(p.variant(UuidUtil.toString(a.getId()))).isSameAs(a);
        assertThat(p.variant((String) null)).isNull();
    }

    @Test
    void firstImageIsTheLowestSortOrderThenTheLowestId() {
        Product p = product(0);
        assertThat(p.firstImageUrl()).isNull();
        p.getImages().add(image(3L, 1, "b"));
        p.getImages().add(image(2L, 1, "a"));
        p.getImages().add(image(9L, 2, "c"));
        assertThat(p.firstImageUrl()).isEqualTo("a");
    }

    private static ProductImage image(Long id, int sortOrder, String url) {
        ProductImage i = new ProductImage();
        ReflectionTestUtils.setField(i, "id", id);
        ReflectionTestUtils.setField(i, "sortOrder", sortOrder);
        ReflectionTestUtils.setField(i, "url", url);
        return i;
    }
}
