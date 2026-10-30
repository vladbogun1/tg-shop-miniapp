package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.inventory.infra.StockWriteoffRepository;
import org.mockito.ArgumentCaptor;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.app.ProductUpsertRequest.VariantInput;
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
    @Mock CatalogDirectory catalogDirectory;
    @Mock BrandAdminService brandService;
    @Mock ImageStorageService imageStorageService;
    @Mock SlugService slugService;
    @Mock TranslationService translationService;
    @Mock StockWriteoffRepository writeoffRepository;
    @Mock AdminAuditService audit;

    com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository preorderSubs =
            org.mockito.Mockito.mock(com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository.class);
    AdminProductService service;
    Product product;
    String id;

    @BeforeEach
    void setUp() {
        com.maxsolch.shop.preorder.app.WaitingCounts waitingCounts = new com.maxsolch.shop.preorder.app.WaitingCounts(preorderSubs);
        ProductQueues queues = new ProductQueues() {
            public void closeFor(byte[] productId) {
            }

            public java.util.Map<String, int[]> waitingByProduct() {
                return waitingCounts.byProduct();
            }
        };
        service = new AdminProductService(productRepository, new ProductStorefront(slugService, productRepository),
                translationService, catalogDirectory, brandService,
                new com.maxsolch.shop.inventory.app.CatalogStock(
                        org.mockito.Mockito.mock(com.maxsolch.shop.inventory.app.LotLedger.class),
                        new com.maxsolch.shop.inventory.app.StockWriteoffs(writeoffRepository, java.time.Clock.systemUTC()), audit),
                queues, org.mockito.Mockito.mock(com.maxsolch.shop.platform.tx.DomainEvents.class),
                java.time.Clock.systemUTC());
        lenient().when(audit.currentAdminName()).thenReturn("Влад");
        lenient().when(catalogDirectory.load()).thenReturn(CatalogSnapshot.EMPTY);
        lenient().when(catalogDirectory.snapshot()).thenReturn(CatalogSnapshot.EMPTY);
        product = new Product();
        product.setId(UuidUtil.randomBytes());
        product.setTitle("Mouse X");
        product.setSlug("mouse-x");
        product.setPriceMinor(90_000);
        product.setStock(1); // two units sold while the form was open (it showed 3)
        id = UuidUtil.toString(product.getId());
        lenient().when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(product));
        lenient().when(productRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void sortByDemandPutsTheMostWantedFirstAndKeepsTheRestInOrder() {
        Product a = named("A");
        Product b = named("B");
        Product c = named("C");
        Product d = named("D");
        when(productRepository.findAllNotArchived()).thenReturn(List.of(a, b, c, d));
        when(preorderSubs.waitingByProduct()).thenReturn(List.of(
                new Object[]{c.getId(), 5L, 6L}, new Object[]{b.getId(), 2L, 9L}));

        List<AdminProductDto> plain = service.list(null);
        List<AdminProductDto> byDemand = service.list("demand");

        assertThat(plain).extracting(AdminProductDto::title).containsExactly("A", "B", "C", "D");
        assertThat(byDemand).extracting(AdminProductDto::title).containsExactly("C", "B", "A", "D");
        assertThat(byDemand.get(0).waitingPeople()).isEqualTo(5);
        assertThat(byDemand.get(0).waitingQty()).isEqualTo(6);
        assertThat(byDemand.get(3).waitingPeople()).isZero();
    }

    private static Product named(String title) {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle(title);
        p.setSlug(title.toLowerCase());
        p.setPriceMinor(100);
        return p;
    }

    private static ProductUpsertRequest req(Integer stock, Integer expected, List<VariantInput> variants) {
        return new ProductUpsertRequest("Mouse X", "new description", 90_000, null, stock, null,
                null, variants, null, null, null, null, null, expected,
                null, null, null, null, null, null, null);
    }

    private static ProductUpsertRequest seoReq(String brand, String sku) {
        return new ProductUpsertRequest("Mouse X", "new description", 90_000, null, null, null,
                null, null, null, null, null, null, sku, null,
                null, null, brand, null, null, null, null);
    }

    @Test
    void skuIsSavedTrimmedAndBlankClears() {
        when(productRepository.skuTaken("MX-01", product.getId())).thenReturn(false);
        AdminProductDto saved = service.update(id, seoReq(null, " MX-01 "));
        assertThat(saved.sku()).isEqualTo("MX-01");

        saved = service.update(id, seoReq(null, ""));
        assertThat(saved.sku()).isNull();
    }

    @Test
    void nullSkuKeepsTheStoredValue() {
        product.setSku("V-1");
        AdminProductDto saved = service.update(id, seoReq(null, null));
        assertThat(saved.sku()).isEqualTo("V-1");
    }

    @Test
    void skuOfAnotherProductIsRejected() {
        when(productRepository.skuTaken("MX-01", product.getId())).thenReturn(true);
        assertThatThrownBy(() -> service.update(id, seoReq(null, "MX-01")))
                .isInstanceOf(DomainException.BadRequest.class)
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
                .isInstanceOf(DomainException.Conflict.class)
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
                .isInstanceOf(DomainException.Conflict.class)
                .hasMessageContaining("white");
    }

    private static ProductUpsertRequest withReason(Integer stock, List<VariantInput> variants, String reason,
                                                   String note) {
        return new ProductUpsertRequest("Mouse X", "new description", 90_000, null, stock, null,
                null, variants, null, null, null, null, null, null,
                null, null, null, null, null, null, null, reason, note);
    }

    @Test
    void loweringStockWithoutAReasonIsRefused() {
        product.setStock(5);
        assertThatThrownBy(() -> service.update(id, req(3, null, null)))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("причину")
                .extracting("code").isEqualTo("STOCK_REASON_REQUIRED");
        verify(productRepository, never()).save(any());
        verify(writeoffRepository, never()).save(any());
    }

    @Test
    void reasonOtherNeedsANote() {
        product.setStock(5);
        assertThatThrownBy(() -> service.update(id, withReason(3, null, "OTHER", "  ")))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("code").isEqualTo("STOCK_REASON_REQUIRED");
        verify(writeoffRepository, never()).save(any());
    }

    @Test
    void unknownReasonCountsAsMissing() {
        product.setStock(5);
        assertThatThrownBy(() -> service.update(id, withReason(3, null, "BECAUSE", null)))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void loweringStockWithAReasonWritesOffTheDifferenceAtTheCurrentPrice() {
        product.setStock(5);
        service.update(id, withReason(3, null, "defect", null));

        ArgumentCaptor<StockWriteoff> cap = ArgumentCaptor.forClass(StockWriteoff.class);
        verify(writeoffRepository).save(cap.capture());
        StockWriteoff w = cap.getValue();
        assertThat(w.getQuantity()).isEqualTo(2);
        assertThat(w.getReason()).isEqualTo("DEFECT");
        assertThat(w.getUnitValueMinor()).isEqualTo(90_000);
        assertThat(w.getTitle()).isEqualTo("Mouse X");
        assertThat(w.getVariantId()).isNull();
        assertThat(w.getAdminName()).isEqualTo("Влад");
    }

    @Test
    void raisingStockNeedsNoReasonAndWritesNothing() {
        service.update(id, req(4, null, null));
        verify(writeoffRepository, never()).save(any());
    }

    @Test
    void loweringAVariantWritesOffThatVariantNotTheRollup() {
        ProductVariant white = variant("white", 4);
        product.getVariants().add(white);
        product.setStock(4);

        service.update(id, withReason(null, List.of(
                new VariantInput(UuidUtil.toString(white.getId()), "white", 1, 4)), "INVENTORY", null));

        ArgumentCaptor<StockWriteoff> cap = ArgumentCaptor.forClass(StockWriteoff.class);
        verify(writeoffRepository).save(cap.capture());
        assertThat(cap.getValue().getQuantity()).isEqualTo(3);
        assertThat(cap.getValue().getTitle()).isEqualTo("Mouse X / white");
        assertThat(cap.getValue().getVariantId()).isEqualTo(white.getId());
        assertThat(cap.getValue().getReason()).isEqualTo("INVENTORY");
    }

    @Test
    void loweringTwoVariantsUnderOneReasonWritesTwoRows() {
        ProductVariant white = variant("white", 4);
        ProductVariant black = variant("black", 2);
        product.getVariants().add(white);
        product.getVariants().add(black);
        product.setStock(6);

        service.update(id, withReason(5, List.of(
                new VariantInput(UuidUtil.toString(white.getId()), "white", 2, null),
                new VariantInput(UuidUtil.toString(black.getId()), "black", 1, null)), "MISSORT", null));

        verify(writeoffRepository, org.mockito.Mockito.times(2)).save(any());
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
