package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.procurement.domain.BatchQueue;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchRepository;
import com.maxsolch.shop.procurement.infra.SupplierRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveLine;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.CancelRequest;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.site.app.SiteRevalidator;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Batch life: partial arrival, several variants in one batch, cancelling, the metrics window. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PreorderBatchServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-27T10:00:00Z");

    @Mock PreorderBatchRepository batches;
    @Mock PreorderBatchItemRepository items;
    @Mock SupplierRepository suppliers;
    @Mock ProductRepository products;
    @Mock BatchQueue queue;
    @Mock LineProducts lineProducts;
    @Mock SettingsService settings;
    @Mock LotLedger ledger;
    @Mock SiteRevalidator revalidator;

    PreorderBatchService service;
    PreorderBatch batch;
    Product product;

    @BeforeEach
    void setUp() {
        service = new PreorderBatchService(batches, items, suppliers, new com.maxsolch.shop.catalog.app.Products(products, org.mockito.Mockito.mock(com.maxsolch.shop.catalog.infra.ProductImageRepository.class)), queue, lineProducts, settings,
                ledger, revalidator, Clock.fixed(NOW, ZoneOffset.UTC));
        batch = new PreorderBatch();
        batch.setId(5L);
        batch.setTitle("Lamzu, ноябрь");
        batch.setHoldHours(24);
        when(batches.findForUpdate(5L)).thenReturn(Optional.of(batch));
        when(batches.findById(5L)).thenReturn(Optional.of(batch));
        when(batches.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)).thenReturn(true);
        when(queue.handOut(any(), any(), anyLong(), any(), anyInt()))
                .thenReturn(new BatchQueue.HandOut(0, 0, 0, 0, 0));
        product = new Product();
        product.setId(UuidUtil.toBytes(UUID.randomUUID()));
        product.setTitle("Lamzu Maya");
        when(products.findByIdForUpdate(any())).thenReturn(Optional.of(product));
        when(products.findById(any())).thenReturn(Optional.of(product));
    }

    private PreorderBatchItem line(long id, ProductVariant variant, int ordered) {
        PreorderBatchItem i = new PreorderBatchItem();
        i.setId(id);
        i.setBatchId(5L);
        i.setProductId(product.getId());
        i.setVariantId(variant == null ? null : variant.getId());
        i.setQtyOrdered(ordered);
        return i;
    }

    private ProductVariant variant(String name, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.toBytes(UUID.randomUUID()));
        v.setName(name);
        v.setStock(stock);
        product.getVariants().add(v);
        return v;
    }

    // ---- arrival

    @Test
    void aPartialArrivalPutsOnlyWhatCameOnTheShelf() {
        product.setStock(1);
        PreorderBatchItem i = line(11, null, 10);
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(i));

        var result = service.arrive(5L, new ArriveRequest(false, null, null, List.of(new ArriveLine(11, 4, null))));

        assertThat(product.getStock()).isEqualTo(5);
        assertThat(i.getQtyArrived()).isEqualTo(4);
        assertThat(result.lines()).singleElement().satisfies(l -> {
            assertThat(l.arrived()).isEqualTo(4);
            assertThat(l.stockAfter()).isEqualTo(5);
        });
        verify(ledger).receive(product.getId(), null, 11L, 4);
        assertThat(batch.statusEnum()).isEqualTo(PreorderBatch.Status.ARRIVED);
        assertThat(batch.getArrivedAt()).isEqualTo(NOW);
    }

    @Test
    void nothingArrivingCreatesNoLotButStillClosesTheBatch() {
        PreorderBatchItem i = line(11, null, 10);
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(i));

        service.arrive(5L, new ArriveRequest(false, null, null, List.of(new ArriveLine(11, 0, null))));

        verify(ledger, never()).receive(any(), any(), anyLong(), anyInt());
        assertThat(batch.statusEnum()).isEqualTo(PreorderBatch.Status.ARRIVED);
    }

    @Test
    void twoVariantsOfOneProductArriveSeparately() {
        ProductVariant black = variant("Black", 0);
        ProductVariant white = variant("White", 1);
        product.setStock(1);
        PreorderBatchItem a = line(11, black, 3);
        PreorderBatchItem b = line(12, white, 2);
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(a, b));

        service.arrive(5L, new ArriveRequest(false, null, null, null));

        assertThat(black.getStock()).isEqualTo(3);
        assertThat(white.getStock()).isEqualTo(3);
        assertThat(product.getStock()).isEqualTo(6); // the product mirrors the sum of its variants
        verify(ledger).receive(product.getId(), black.getId(), 11L, 3);
        verify(ledger).receive(product.getId(), white.getId(), 12L, 2);
        verify(queue).handOut(product, black, 5L, Distribution.QUEUE_HOLD, 24);
        verify(queue).handOut(product, white, 5L, Distribution.QUEUE_HOLD, 24);
    }

    @Test
    void aDryRunChangesNothing() {
        PreorderBatchItem i = line(11, null, 10);
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(i));
        when(queue.preview(any(), any(), anyInt(), any())).thenReturn(new BatchQueue.HandOut(1, 1, 0, 0, 0));

        var result = service.arrive(5L, new ArriveRequest(true, null, null, null));

        assertThat(result.dryRun()).isTrue();
        assertThat(product.getStock()).isZero();
        assertThat(batch.statusEnum()).isEqualTo(PreorderBatch.Status.ORDERED);
        verify(ledger, never()).receive(any(), any(), anyLong(), anyInt());
    }

    // ---- cancelling

    private void lineWithQueue() {
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(line(11, null, 5)));
    }

    @Test
    void cancellingKeepsTheWaitersOnTheListByDefault() {
        lineWithQueue();

        service.cancel(5L, new CancelRequest(false, null), false);

        assertThat(batch.statusEnum()).isEqualTo(PreorderBatch.Status.CANCELLED);
        verify(queue).onBatchCancelled(argThat(lines -> lines.size() == 1), eq(false), eq(NOW));
        verify(revalidator).allChanged();
    }

    @Test
    void cancellingWithCloseQueueAsksTheQueueToTakeTheWaitersOff() {
        lineWithQueue();

        service.cancel(5L, new CancelRequest(true, "завод закрылся"), false);

        verify(queue).onBatchCancelled(argThat(lines -> lines.size() == 1), eq(true), eq(NOW));
        assertThat(batch.getPrivateNote()).contains("завод закрылся");
    }

    @Test
    void withoutTheAnyProductSettingACancelledBatchClosesTheQueueAnyway() {
        when(settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)).thenReturn(false);
        lineWithQueue();

        service.cancel(5L, null, false);

        verify(queue).onBatchCancelled(any(), eq(true), eq(NOW));
    }

    @Test
    void aClosedBatchCannotBeCancelledAgain() {
        batch.setStatus(PreorderBatch.Status.ARRIVED.name());

        assertThatThrownBy(() -> service.cancel(5L, null, false)).isInstanceOf(DomainException.BadRequest.class);
        verify(queue, never()).onBatchCancelled(any(), anyBoolean(), any());
    }
}
