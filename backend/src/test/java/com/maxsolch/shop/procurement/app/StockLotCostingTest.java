package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRowDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ReconcileDto;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Начальная себестоимость» of the old stock and «Выровнять» lots with the stock — margin and «Финансы» rest on them. */
class StockLotCostingTest {

    private final LotLedger ledger = mock(LotLedger.class);
    private final Products products = mock(Products.class);
    private final LineProducts queue = mock(LineProducts.class);
    private final StockLotCosting costing = new StockLotCosting(mock(CostingService.class), products, queue, ledger,
            mock(LotSources.class));

    private static Product product(String title, int stock) {
        Product p = new Product();
        OrderFixtures.set(p, "id", UuidUtil.randomBytes());
        p.retitle(title);
        p.changeStock(stock);
        return p;
    }

    private static StockLot lot(Product p, StockLot.Kind kind, int left, Long cost) {
        StockLot l = new StockLot();
        l.setProductId(p.getId());
        l.setKind(kind.name());
        l.setQtyIn(left);
        l.setQtyLeft(left);
        l.setUnitCostMinor(cost);
        return l;
    }

    @Test
    void opening_sumsOldUnitsPerProduct_skipsBatchLots_showsTheTypedCost() {
        Product p = product("Килимок", 9);
        when(ledger.lotsOnShelf()).thenReturn(List.of(
                lot(p, StockLot.Kind.OPENING, 4, 12_000L),
                lot(p, StockLot.Kind.MANUAL, 2, null),
                lot(p, StockLot.Kind.BATCH, 3, 99_900L)));
        when(queue.productsOf(any())).thenReturn(Map.of(UuidUtil.toString(p.getId()), p));

        List<OpeningRowDto> rows = costing.opening();

        assertThat(rows).singleElement().satisfies(r -> {
            assertThat(r.units()).isEqualTo(6);          // 4 + 2, the batch lot is not "old stock"
            assertThat(r.unitCostMinor()).isEqualTo(12_000L);
        });
    }

    @Test
    void opening_withoutATypedCost_isUnknown() {
        Product p = product("Мишка", 3);
        when(ledger.lotsOnShelf()).thenReturn(List.of(lot(p, StockLot.Kind.OPENING, 3, null)));
        when(queue.productsOf(any())).thenReturn(Map.of(UuidUtil.toString(p.getId()), p));

        assertThat(costing.opening()).singleElement().extracting(OpeningRowDto::unitCostMinor).isNull();
    }

    @Test
    void setOpening_putsTheCostOnOldLotsOnly_andNullClearsIt() {
        Product p = product("Килимок", 9);
        StockLot old = lot(p, StockLot.Kind.OPENING, 4, null);
        StockLot manual = lot(p, StockLot.Kind.MANUAL, 2, 5L);
        StockLot batch = lot(p, StockLot.Kind.BATCH, 3, 777L);
        when(ledger.lotsOfLine(any(), any())).thenReturn(List.of(old, manual, batch));

        costing.setOpening(new OpeningRequest(UuidUtil.toString(p.getId()), null, 15_000L));

        assertThat(old.getUnitCostMinor()).isEqualTo(15_000L);
        assertThat(manual.getUnitCostMinor()).isEqualTo(15_000L);
        assertThat(batch.getUnitCostMinor()).isEqualTo(777L);

        costing.setOpening(new OpeningRequest(UuidUtil.toString(p.getId()), null, null));
        assertThat(old.getUnitCostMinor()).isNull();
        assertThat(batch.getUnitCostMinor()).isEqualTo(777L);
    }

    @Test
    void setOpening_zeroCostIsAllowed_negativeIsRefused_noOldStockIsNotFound() {
        Product p = product("Килимок", 4);
        StockLot old = lot(p, StockLot.Kind.OPENING, 4, null);
        when(ledger.lotsOfLine(any(), any())).thenReturn(List.of(old));
        String id = UuidUtil.toString(p.getId());

        costing.setOpening(new OpeningRequest(id, null, 0L));
        assertThat(old.getUnitCostMinor()).isZero();

        assertThatThrownBy(() -> costing.setOpening(new OpeningRequest(id, null, -1L)))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.BAD_COST);
        assertThatThrownBy(() -> costing.setOpening(new OpeningRequest(null, null, 100L)))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.PRODUCT_REQUIRED);

        when(ledger.lotsOfLine(any(), any())).thenReturn(List.of(lot(p, StockLot.Kind.BATCH, 4, null)));
        assertThatThrownBy(() -> costing.setOpening(new OpeningRequest(id, null, 100L)))
                .isInstanceOf(DomainException.NotFound.class)
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.NO_OLD_STOCK);
    }

    @Test
    void reconcile_resyncsOnlyProductsWhoseLotsDriftedFromTheStock() {
        Product drifted = product("Дрейф", 10);
        Product fine = product("Норма", 5);
        when(products.findAll()).thenReturn(List.of(drifted, fine));
        when(ledger.allLots()).thenReturn(List.of(
                lot(drifted, StockLot.Kind.OPENING, 7, null),   // lots 7, shelf 10
                lot(fine, StockLot.Kind.OPENING, 5, null)));

        ReconcileDto r = costing.reconcile();

        assertThat(r.keys()).isEqualTo(2);
        assertThat(r.fixed()).isEqualTo(1);
        assertThat(r.details()).singleElement().asString().contains("Дрейф").contains("7").contains("10");
        verify(ledger).syncProduct(drifted);
        verify(ledger, never()).syncProduct(fine);
    }

    @Test
    void reconcile_aProductWithNoLotsButStockIsFixed() {
        Product p = product("Без партий", 3);
        when(products.findAll()).thenReturn(List.of(p));
        when(ledger.allLots()).thenReturn(List.of());

        assertThat(costing.reconcile().fixed()).isEqualTo(1);
        verify(ledger).syncProduct(p);
    }
}
