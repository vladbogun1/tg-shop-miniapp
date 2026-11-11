package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.CostingDtos.LotCostRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.LotSourceRequest;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Склад по партиям»: units without a cost get a source (an arrived batch) or a typed purchase + delivery. */
class LotSourcesTest {

    private final LotLedger ledger = mock(LotLedger.class);
    private final Products products = mock(Products.class);
    private final PreorderBatchItemRepository items = mock(PreorderBatchItemRepository.class);
    private final PreorderBatchRepository batches = mock(PreorderBatchRepository.class);
    private final LotSources sources = new LotSources(ledger, mock(CostingService.class), products, items, batches);
    private final AtomicLong ids = new AtomicLong(10);
    private final List<StockLot> lots = new ArrayList<>();
    private Product p;

    @BeforeEach
    void setUp() {
        p = new Product();
        OrderFixtures.set(p, "id", UuidUtil.randomBytes());
        p.retitle("Zpmax ZQ4 Pro");
        when(products.findByIdForUpdate(any())).thenReturn(Optional.of(p));
        when(ledger.lotsOfLine(any(), any())).thenAnswer(inv -> lots);
        when(ledger.split(any(), anyInt())).thenAnswer(inv -> {
            StockLot from = inv.getArgument(0);
            int n = inv.getArgument(1);
            from.setQtyLeft(from.getQtyLeft() - n);
            from.setQtyIn(from.getQtyIn() - n);
            return lot(from.getKind(), n, null);
        });
    }

    private StockLot lot(String kind, int left, Long cost) {
        StockLot l = new StockLot();
        l.setId(ids.incrementAndGet());
        l.setProductId(p.getId());
        l.setKind(kind);
        l.setQtyIn(left);
        l.setQtyLeft(left);
        l.setUnitCostMinor(cost);
        lots.add(l);
        return l;
    }

    private PreorderBatchItem line(long id, PreorderBatch.Status status) {
        PreorderBatchItem i = new PreorderBatchItem();
        i.setId(id);
        i.setBatchId(4L);
        i.setProductId(p.getId());
        PreorderBatch b = new PreorderBatch();
        b.setId(4L);
        OrderFixtures.set(b, "status", status);
        when(items.findById(id)).thenReturn(Optional.of(i));
        when(batches.findById(4L)).thenReturn(Optional.of(b));
        return i;
    }

    private String pid() {
        return UuidUtil.toString(p.getId());
    }

    @Test
    void price_wholeNewestLot_getsPurchasePlusDelivery_inPlace() {
        StockLot old = lot("OPENING", 5, null);
        StockLot added = lot("MANUAL", 3, null);

        LotSources.Outcome o = sources.assign(pid(), new LotSourceRequest(null, 3, "PRICE", null, 90_000L, 6_000L, "нашлись"));

        assertThat(added.getUnitCostMinor()).isEqualTo(96_000L);
        assertThat(added.getUnitExtraMinor()).isEqualTo(6_000L);
        assertThat(old.getUnitCostMinor()).isNull();
        verify(ledger, never()).split(any(), anyInt());
        assertThat(o.what()).contains("3 шт", "нашлись");
    }

    @Test
    void price_partOfALot_splitsItOff_restStaysUnknown() {
        StockLot old = lot("OPENING", 5, null);

        sources.assign(pid(), new LotSourceRequest(null, 2, "PRICE", null, 50_000L, null, null));

        assertThat(old.getQtyLeft()).isEqualTo(3);
        assertThat(old.getUnitCostMinor()).isNull();
        StockLot part = lots.get(1);
        assertThat(part.getQtyLeft()).isEqualTo(2);
        assertThat(part.getUnitCostMinor()).isEqualTo(50_000L);
        assertThat(part.getUnitExtraMinor()).isNull();
    }

    @Test
    void batch_movesUnitsNewestFirst_toAnArrivedLineOfTheSameProduct() {
        StockLot old = lot("OPENING", 2, null);
        StockLot added = lot("MANUAL", 3, null);
        line(77L, PreorderBatch.Status.ARRIVED);

        sources.assign(pid(), new LotSourceRequest(null, 4, "BATCH", 77L, null, null, null));

        verify(ledger).reattach(added, 3, 77L);
        verify(ledger).reattach(old, 1, 77L);
    }

    @Test
    void batch_notArrivedOrOtherProduct_isRefused() {
        lot("MANUAL", 3, null);
        line(77L, PreorderBatch.Status.IN_TRANSIT);
        assertThatThrownBy(() -> sources.assign(pid(), new LotSourceRequest(null, 1, "BATCH", 77L, null, null, null)))
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.BAD_LOT_SOURCE);

        PreorderBatchItem other = line(78L, PreorderBatch.Status.ARRIVED);
        other.setProductId(UuidUtil.randomBytes());
        assertThatThrownBy(() -> sources.assign(pid(), new LotSourceRequest(null, 1, "BATCH", 78L, null, null, null)))
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.BAD_LOT_SOURCE);
        verify(ledger, never()).reattach(any(), anyInt(), anyLong());
    }

    @Test
    void moreThanTheUnpricedUnits_orNoQty_orBadCost_isRefused() {
        lot("MANUAL", 2, null);
        lot("OPENING", 9, 10_000L);                        // already priced: not counted
        lot("BATCH", 9, null);                             // batch lots never count

        assertThatThrownBy(() -> sources.assign(pid(), new LotSourceRequest(null, 3, "PRICE", null, 1L, null, null)))
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.NOT_ENOUGH_UNPRICED);
        assertThatThrownBy(() -> sources.assign(pid(), new LotSourceRequest(null, 0, "PRICE", null, 1L, null, null)))
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.BAD_QTY);
        assertThatThrownBy(() -> sources.assign(pid(), new LotSourceRequest(null, 1, "PRICE", null, null, null, null)))
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.BAD_COST);
        assertThatThrownBy(() -> sources.assign(pid(), new LotSourceRequest(null, 1, "PRICE", null, 5L, -1L, null)))
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.BAD_COST);
    }

    @Test
    void setLotCost_splitsIntoPurchaseAndDelivery_nullClears_batchLotIsRefused() {
        StockLot old = lot("OPENING", 5, null);
        StockLot batch = lot("BATCH", 2, null);
        when(ledger.lotsByIds(List.of(old.getId()))).thenReturn(List.of(old));
        when(ledger.lotsByIds(List.of(batch.getId()))).thenReturn(List.of(batch));

        sources.setLotCost(old.getId(), new LotCostRequest(80_000L, 5_000L));
        assertThat(old.getUnitCostMinor()).isEqualTo(85_000L);
        assertThat(old.getUnitExtraMinor()).isEqualTo(5_000L);

        sources.setLotCost(old.getId(), new LotCostRequest(null, 5_000L));
        assertThat(old.getUnitCostMinor()).isNull();
        assertThat(old.getUnitExtraMinor()).isNull();

        assertThatThrownBy(() -> sources.setLotCost(batch.getId(), new LotCostRequest(1L, null)))
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(ProcurementError.LOT_IS_BATCH);
    }
}
