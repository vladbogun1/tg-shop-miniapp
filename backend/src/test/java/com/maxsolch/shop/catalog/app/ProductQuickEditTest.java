package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.inventory.app.CatalogStock;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.app.StockWriteoffs;
import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.inventory.infra.StockWriteoffRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The list's quick edit follows the rules of the full save: stale values are conflicts, a drop needs a reason. */
@ExtendWith(MockitoExtension.class)
class ProductQuickEditTest {

    @Mock ProductRepository productRepository;
    @Mock CatalogDirectory catalogDirectory;
    @Mock StockWriteoffRepository writeoffRepository;
    @Mock AdminAuditService audit;
    LotLedger ledger = mock(LotLedger.class);

    ProductQuickEdit quick;
    Product product;
    String id;

    @BeforeEach
    void setUp() {
        quick = new ProductQuickEdit(productRepository,
                new CatalogStock(ledger, new StockWriteoffs(writeoffRepository, Clock.systemUTC()), audit),
                catalogDirectory);
        lenient().when(audit.currentAdminName()).thenReturn("Влад");
        lenient().when(catalogDirectory.load()).thenReturn(CatalogSnapshot.EMPTY);
        product = new Product();
        ReflectionTestUtils.setField(product, "id", UuidUtil.randomBytes());
        product.retitle("Mouse X");
        product.changeSlug("mouse-x");
        product.reprice(90_000);
        product.changeStock(5);
        id = UuidUtil.toString(product.getId());
        lenient().when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(product));
        lenient().when(productRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static ProductQuickEditRequest price(Long price, Long expected) {
        return new ProductQuickEditRequest(price, expected, null, null, null, null);
    }

    private static ProductQuickEditRequest stock(Integer stock, Integer expected, String reason, String note) {
        return new ProductQuickEditRequest(null, null, stock, expected, reason, note);
    }

    @Test
    void priceChangesAndStockStaysUntouched() {
        AdminProductDto saved = quick.apply(id, price(80_000L, 90_000L));

        assertThat(saved.priceMinor()).isEqualTo(80_000);
        assertThat(saved.stock()).isEqualTo(5);
        verify(ledger).syncProduct(product);
    }

    @Test
    void anEditWithNothingToChangeIsRefused() {
        assertThatThrownBy(() -> quick.apply(id, new ProductQuickEditRequest(null, null, null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("code").isEqualTo("QUICK_EDIT_EMPTY");
        verify(productRepository, never()).save(any());
    }

    @Test
    void unknownProductIsNotFound() {
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> quick.apply(id, price(1L, null))).isInstanceOf(DomainException.NotFound.class);
    }

    @Test
    void stalePriceIsAConflictAndNothingIsSaved() {
        product.reprice(95_000); // somebody changed it in the editor
        assertThatThrownBy(() -> quick.apply(id, price(80_000L, 90_000L)))
                .isInstanceOf(DomainException.Conflict.class)
                .hasMessageContaining("было 90000, стало 95000")
                .extracting("code").isEqualTo("PRICE_CONFLICT");
        assertThat(product.getPriceMinor()).isEqualTo(95_000);
        verify(productRepository, never()).save(any());
    }

    @Test
    void staleStockIsAConflictAndNothingIsSaved() {
        product.changeStock(2); // two more sold
        assertThatThrownBy(() -> quick.apply(id, stock(9, 5, null, null)))
                .isInstanceOf(DomainException.Conflict.class)
                .extracting("code").isEqualTo("STOCK_CONFLICT");
        assertThat(product.getStock()).isEqualTo(2);
        verify(productRepository, never()).save(any());
    }

    @Test
    void raisingStockNeedsNoReason() {
        AdminProductDto saved = quick.apply(id, stock(8, 5, null, null));

        assertThat(saved.stock()).isEqualTo(8);
        verify(writeoffRepository, never()).save(any());
    }

    @Test
    void loweringStockWithoutAReasonIsRefusedAndKeepsTheStock() {
        assertThatThrownBy(() -> quick.apply(id, stock(3, 5, null, null)))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("code").isEqualTo("STOCK_REASON_REQUIRED");
        assertThat(product.getStock()).isEqualTo(5);
        verify(productRepository, never()).save(any());
    }

    @Test
    void loweringStockWithAReasonWritesOffTheDifference() {
        quick.apply(id, stock(3, 5, "DEFECT", null));

        ArgumentCaptor<StockWriteoff> cap = ArgumentCaptor.forClass(StockWriteoff.class);
        verify(writeoffRepository).save(cap.capture());
        assertThat(cap.getValue().getQuantity()).isEqualTo(2);
        assertThat(product.getStock()).isEqualTo(3);
    }

    @Test
    void stockOfAProductWithVariantsIsNotEditedHere() {
        ProductVariant white = new ProductVariant();
        white.assignId(UuidUtil.randomBytes());
        white.attachTo(product);
        white.rename("white");
        product.getVariants().add(white);

        assertThatThrownBy(() -> quick.apply(id, stock(1, 5, "DEFECT", null)))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("code").isEqualTo("QUICK_STOCK_HAS_VARIANTS");
        // its price still can be
        assertThat(quick.apply(id, price(70_000L, null)).priceMinor()).isEqualTo(70_000);
    }
}
