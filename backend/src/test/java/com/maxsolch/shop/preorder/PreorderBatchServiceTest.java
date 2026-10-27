package com.maxsolch.shop.preorder;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.costing.LotLedger;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.preorder.PreorderBatch.Distribution;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveLine;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveRequest;
import com.maxsolch.shop.preorder.PreorderDtos.CancelRequest;
import com.maxsolch.shop.preorder.PreorderSubscription.Status;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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
    @Mock PreorderSubscriptionRepository subs;
    @Mock SupplierRepository suppliers;
    @Mock ProductRepository products;
    @Mock UserRepository users;
    @Mock PreorderQueueService queue;
    @Mock SettingsService settings;
    @Mock ApplicationEventPublisher events;
    @Mock LotLedger ledger;
    @Mock SiteRevalidator revalidator;

    PreorderBatchService service;
    PreorderBatch batch;
    Product product;

    @BeforeEach
    void setUp() {
        service = new PreorderBatchService(batches, items, subs, suppliers, products, users, queue, settings, events,
                Clock.fixed(NOW, ZoneOffset.UTC));
        service.setLedger(ledger);
        service.setSiteRevalidator(revalidator);
        batch = new PreorderBatch();
        batch.setId(5L);
        batch.setTitle("Lamzu, ноябрь");
        batch.setHoldHours(24);
        when(batches.findForUpdate(5L)).thenReturn(Optional.of(batch));
        when(batches.findById(5L)).thenReturn(Optional.of(batch));
        when(batches.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)).thenReturn(true);
        when(queue.handOut(any(), any(), anyLong(), any(), anyInt(), anyBoolean()))
                .thenReturn(new PreorderQueueService.HandOut(0, 0, 0, 0, 0));
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

    private PreorderSubscription waiting(long id, Status status) {
        PreorderSubscription s = new PreorderSubscription();
        s.setId(id);
        s.setUserId(100 + id);
        s.setProductId(product.getId());
        s.setStatus(status.name());
        s.setQty(1);
        s.setCreatedAt(NOW);
        return s;
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
        verify(queue).handOut(product, black, 5L, Distribution.QUEUE_HOLD, 24, true);
        verify(queue).handOut(product, white, 5L, Distribution.QUEUE_HOLD, 24, true);
    }

    @Test
    void aDryRunChangesNothing() {
        PreorderBatchItem i = line(11, null, 10);
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(i));
        when(queue.previewHandOut(any(), any(), anyInt(), any())).thenReturn(new PreorderQueueService.HandOut(1, 1, 0, 0, 0));

        var result = service.arrive(5L, new ArriveRequest(true, null, null, null));

        assertThat(result.dryRun()).isTrue();
        assertThat(product.getStock()).isZero();
        assertThat(batch.statusEnum()).isEqualTo(PreorderBatch.Status.ORDERED);
        verify(ledger, never()).receive(any(), any(), anyLong(), anyInt());
    }

    // ---- cancelling

    private List<PreorderSubscription> queueOfLine() {
        List<PreorderSubscription> q = new ArrayList<>(List.of(waiting(1, Status.WAITING), waiting(2, Status.HELD),
                waiting(3, Status.WAITING)));
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(line(11, null, 5)));
        when(subs.queue(any(), any())).thenReturn(q);
        return q;
    }

    @Test
    void cancellingKeepsTheWaitersOnTheListAndTellsThem() {
        List<PreorderSubscription> q = queueOfLine();

        service.cancel(5L, new CancelRequest(false, null), false);

        assertThat(batch.statusEnum()).isEqualTo(PreorderBatch.Status.CANCELLED);
        assertThat(q).extracting(PreorderSubscription::getStatus).containsExactly("WAITING", "HELD", "WAITING");
        verify(events).publishEvent(new PreorderEvents.BatchCancelledKept(1));
        verify(events).publishEvent(new PreorderEvents.BatchCancelledKept(3));
        verify(events, never()).publishEvent(new PreorderEvents.BatchCancelledKept(2));
        verify(revalidator).allChanged();
    }

    @Test
    void cancellingWithCloseQueueTakesTheWaitersOff() {
        List<PreorderSubscription> q = queueOfLine();

        service.cancel(5L, new CancelRequest(true, "завод закрылся"), false);

        assertThat(q.get(0).getStatus()).isEqualTo("CANCELLED");
        assertThat(q.get(1).getStatus()).isEqualTo("HELD");
        assertThat(q.get(2).getStatus()).isEqualTo("CANCELLED");
        verify(events).publishEvent(new PreorderEvents.Closed(1, "BATCH_CANCELLED"));
        verify(events).publishEvent(new PreorderEvents.Closed(3, "BATCH_CANCELLED"));
        assertThat(batch.getPrivateNote()).contains("завод закрылся");
    }

    @Test
    void withoutTheAnyProductSettingACancelledBatchClosesTheQueueAnyway() {
        when(settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)).thenReturn(false);
        List<PreorderSubscription> q = queueOfLine();

        service.cancel(5L, null, false);

        assertThat(q.get(0).getStatus()).isEqualTo("CANCELLED");
        verify(events).publishEvent(new PreorderEvents.Closed(1, "BATCH_CANCELLED"));
    }

    @Test
    void aClosedBatchCannotBeCancelledAgain() {
        batch.setStatus(PreorderBatch.Status.ARRIVED.name());

        assertThatThrownBy(() -> service.cancel(5L, null, false)).isInstanceOf(BadRequestException.class);
    }

    // ---- metrics

    @Test
    void metricsRejectABrokenPeriod() {
        LocalDate d = LocalDate.of(2026, 10, 1);

        assertThatThrownBy(() -> service.metrics(d, d.minusDays(1))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.metrics(d, d.plusDays(500))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.metrics(null, d)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void metricsUseKyivDaysAndComputeTheConversion() {
        Instant from = LocalDate.of(2026, 10, 1).atStartOfDay(PreorderQueueService.KYIV).toInstant();
        Instant to = LocalDate.of(2026, 10, 8).atStartOfDay(PreorderQueueService.KYIV).toInstant();
        when(subs.joinedBetween(from, to)).thenReturn(List.<Object[]>of(new Object[]{12L, 9L}));
        when(subs.holdUnitsGiven(from, to)).thenReturn(8L);
        when(subs.closedAfterHold(eq("BOUGHT"), eq(from), eq(to))).thenReturn(3L);
        when(subs.closedAfterHold(eq("EXPIRED"), eq(from), eq(to))).thenReturn(4L);
        when(items.arrivedBetween(from, to)).thenReturn(40L);

        var m = service.metrics(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 7));

        assertThat(m.subscriptions()).isEqualTo(12);
        assertThat(m.people()).isEqualTo(9);
        assertThat(m.holdsGiven()).isEqualTo(8);
        assertThat(m.boughtFromHold()).isEqualTo(3);
        assertThat(m.expired()).isEqualTo(4);
        assertThat(m.conversionPercent()).isEqualTo(37.5);
        assertThat(m.arrivedUnits()).isEqualTo(40);
    }

    @Test
    void metricsConversionIsZeroWhenNothingWasHeld() {
        when(subs.joinedBetween(any(), any())).thenReturn(List.of());

        var m = service.metrics(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));

        assertThat(m.conversionPercent()).isZero();
        assertThat(m.subscriptions()).isZero();
    }
}
