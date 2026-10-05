package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import com.maxsolch.shop.web.dto.AdminProductDto;
import com.maxsolch.shop.web.dto.ProductUpsertRequest;
import com.maxsolch.shop.web.dto.ProductUpsertRequest.VariantInput;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A5 / K-2: saving the product form must not overwrite stock that orders changed while the form
 * was open. Untouched stock is not sent (null) and is kept; a changed one is checked against the
 * value the admin saw (expectedStock) and rejected with STOCK_CONFLICT when it moved.
 */
@ExtendWith(MockitoExtension.class)
class AdminProductServiceTest {

    @Mock ProductRepository productRepository;
    @Mock TagRepository tagRepository;
    @Mock ImageStorageService imageStorageService;
    @Mock SlugService slugService;
    @Mock TranslationService translationService;

    AdminProductService service;
    Product product;
    String id;

    @BeforeEach
    void setUp() {
        service = new AdminProductService(productRepository, tagRepository, imageStorageService,
                slugService, translationService);
        product = new Product();
        product.setId(UuidUtil.randomBytes());
        product.setTitle("Mouse X");
        product.setSlug("mouse-x");
        product.setPriceMinor(90_000);
        product.setStock(1); // two units sold while the form was open (it showed 3)
        id = UuidUtil.toString(product.getId());
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(product));
        lenient().when(productRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static ProductUpsertRequest req(Integer stock, Integer expected, List<VariantInput> variants) {
        return new ProductUpsertRequest("Mouse X", "new description", 90_000, null, stock, null,
                null, null, variants, null, null, null, null, null, null, expected);
    }

    private static ProductUpsertRequest seoReq(String brand, String sku) {
        return new ProductUpsertRequest("Mouse X", "new description", 90_000, null, null, null,
                null, null, null, null, null, null, null, brand, sku, null);
    }

    @Test
    void brandAndSkuAreSavedTrimmedAndBlankClears() {
        when(productRepository.skuTaken("MX-01", product.getId())).thenReturn(false);
        AdminProductDto saved = service.update(id, seoReq("  Attack Shark ", " MX-01 "));
        assertThat(saved.brand()).isEqualTo("Attack Shark");
        assertThat(saved.sku()).isEqualTo("MX-01");

        saved = service.update(id, seoReq(" ", ""));
        assertThat(saved.brand()).isNull();
        assertThat(saved.sku()).isNull();
    }

    @Test
    void nullBrandAndSkuKeepTheStoredValues() {
        product.setBrand("VGN");
        product.setSku("V-1");
        AdminProductDto saved = service.update(id, seoReq(null, null));
        assertThat(saved.brand()).isEqualTo("VGN");
        assertThat(saved.sku()).isEqualTo("V-1");
    }

    @Test
    void skuOfAnotherProductIsRejected() {
        when(productRepository.skuTaken("MX-01", product.getId())).thenReturn(true);
        assertThatThrownBy(() -> service.update(id, seoReq(null, "MX-01")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("MX-01");
        verify(productRepository, never()).save(any());
    }

    @Test
    void untouchedStockIsKept() {
        AdminProductDto saved = service.update(id, req(null, null, null));

        assertThat(saved.stock()).isEqualTo(1);
        assertThat(saved.description()).isEqualTo("new description");
    }

    @Test
    void changedStockOverAStaleValueIsRejected() {
        assertThatThrownBy(() -> service.update(id, req(5, 3, null)))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("было 3, стало 1")
                .extracting("code").isEqualTo("STOCK_CONFLICT");
        verify(productRepository, never()).save(any());
    }

    @Test
    void changedStockOverTheCurrentValueIsApplied() {
        AdminProductDto saved = service.update(id, req(5, 1, null));

        assertThat(saved.stock()).isEqualTo(5);
    }

    @Test
    void legacyClientWithoutExpectationStillSaves() {
        AdminProductDto saved = service.update(id, req(4, null, null));

        assertThat(saved.stock()).isEqualTo(4);
    }

    @Test
    void variantStockFollowsTheSameRules() {
        ProductVariant white = variant("white", 2);
        ProductVariant black = variant("black", 0);
        product.getVariants().add(white);
        product.getVariants().add(black);
        product.setStock(2);

        // white untouched (null), black 0 -> 3 with a correct expectation; a new variant gets 0.
        AdminProductDto saved = service.update(id, req(null, null, List.of(
                new VariantInput(UuidUtil.toString(white.getId()), "white", null, null),
                new VariantInput(UuidUtil.toString(black.getId()), "black", 3, 0),
                new VariantInput(null, "red", null, null))));

        assertThat(white.getStock()).isEqualTo(2);
        assertThat(black.getStock()).isEqualTo(3);
        assertThat(saved.stock()).isEqualTo(5); // rollup
        assertThat(saved.variants()).hasSize(3);
    }

    @Test
    void staleVariantStockIsRejected() {
        ProductVariant white = variant("white", 1);
        product.getVariants().add(white);

        assertThatThrownBy(() -> service.update(id, req(null, null, List.of(
                new VariantInput(UuidUtil.toString(white.getId()), "white", 4, 3)))))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("white");
    }

    private ProductVariant variant(String name, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.randomBytes());
        v.setProduct(product);
        v.setName(name);
        v.setStock(stock);
        return v;
    }
}
