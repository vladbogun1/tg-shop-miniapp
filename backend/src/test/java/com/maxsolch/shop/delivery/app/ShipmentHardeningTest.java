package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static com.maxsolch.shop.delivery.app.NpFixtures.TTN;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The edge cases of the NP port fixed before prod (2026-11-12): typed-in number, in-flight create, busy lock. */
class ShipmentHardeningTest {

    private static final String TYPED = "59000000000001";

    private final InMemoryLockProvider table = new InMemoryLockProvider();
    private final ShipmentLocks locks = NpFixtures.locks(table);
    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final NpWaybillWriter writer = mock(NpWaybillWriter.class);
    private final ShipmentStore store = mock(ShipmentStore.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final ShipmentCancellation cancellation = NpFixtures.cancellation(shipments, writer, store, locks);
    private final ShipmentManualSync manual = new ShipmentManualSync(orders, shipments, new NpFixtures.DirectTx(),
            locks, cancellation);

    private OrderShipment activeApiCreated() {
        OrderShipment s = NpFixtures.api(ShipmentStage.CREATED);
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.of(s));
        when(shipments.findByOrderIdInAndActiveTrue(any())).thenReturn(List.of(s));
        return s;
    }

    private void typed(String number) {
        when(orders.find(ORDER)).thenReturn(Optional.of(NpFixtures.order(OrderStatus.APPROVED, false, number)));
    }

    /** Somebody else (another backend, another request) holds the order's waybill lock. */
    private DbLocks.Held holdLock() {
        return new DbLocks(table, Clock.systemUTC()).tryLock(ShipmentLocks.name(ORDER), Duration.ofMinutes(2))
                .orElseThrow();
    }

    private static boolean manualRow(OrderShipment s) {
        return OrderShipment.ORIGIN_MANUAL.equals(s.getOrigin()) && TYPED.equals(s.getTtn());
    }

    // --- 2a: another number typed over our waybill NP has no parcel for

    @Test
    void anotherTypedNumberDeletesOurWaybillAtNpThenTracksTheTypedOne() {
        OrderShipment ours = activeApiCreated();
        typed(TYPED);

        manual.sync(ORDER);

        verify(writer).delete(eq("np-ref-1"), eq(TTN), anyString());
        verify(store).deactivate(ours.getId());
        verify(shipments).save(argThat(ShipmentHardeningTest::manualRow));
        verify(store, never()).syncError(any(), anyString());
    }

    @Test
    void npRefusingToDeleteKeepsOurWaybillActiveWithTheErrorAndTheTypedNumberWaits() {
        OrderShipment ours = activeApiCreated();
        typed(TYPED);
        doThrow(NovaPoshtaException.rejected("Document is busy")).when(writer)
                .delete(anyString(), anyString(), anyString());

        manual.sync(ORDER);

        verify(store).syncError(eq(ours.getId()), argThat(t -> t.startsWith("Введена другая ТТН")
                && t.contains("Document is busy")));
        verify(store, never()).deactivate(any());
        verify(shipments, never()).save(any());
        assertThat(ours.isActive()).isTrue();

        // «Внимание» says to delete it in NP's cabinet, not «ТТН устарела — Перестворити».
        ours.setSyncError(ShipmentManualSync.REPLACED + "Document is busy");
        ours.setCreatedAt(NpFixtures.now().minus(Duration.ofHours(1)));
        ParcelIssues.Reason r = ParcelIssues.reason(ours, NpFixtures.order(OrderStatus.APPROVED, false, TYPED),
                NpFixtures.now(), new ParcelIssues.ParcelLimits(5, 2, 60));
        assertThat(r.kind()).isEqualTo("SYNC_ERROR");
        assertThat(r.text()).startsWith("Введена другая ТТН").doesNotContain("Перестворити");
    }

    @Test
    void aBusyLockLeavesTheSwapForTheNextTick() {
        activeApiCreated();
        typed(TYPED);

        try (DbLocks.Held ignored = holdLock()) {
            manual.sync(ORDER);
        }

        verify(writer, never()).delete(anyString(), anyString(), anyString());
        verify(shipments, never()).save(any());
        verify(store, never()).syncError(any(), anyString());
    }

    @Test
    void theSameNumberAsOursChangesNothing() {
        activeApiCreated();
        typed(TTN);

        manual.sync(ORDER);

        verify(writer, never()).delete(anyString(), anyString(), anyString());
        verify(shipments, never()).save(any());
    }

    @Test
    void aTypedNumberOverAHandedOverWaybillOnlyRetiresIt() {
        OrderShipment atNp = NpFixtures.api(ShipmentStage.IN_TRANSIT);
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.of(atNp));
        when(shipments.findByOrderIdInAndActiveTrue(any())).thenReturn(List.of(atNp));
        typed(TYPED);

        manual.sync(ORDER);

        verify(writer, never()).delete(anyString(), anyString(), anyString());
        assertThat(atNp.isActive()).isFalse();
        verify(shipments).save(argThat(ShipmentHardeningTest::manualRow));
    }

    // --- 2b: the order closed while NP was making the waybill

    @Test
    void anOrderRejectedWhileTheWaybillWasMadeGetsItDeletedRightAfter() {
        ShipmentPreparation preparation = mock(ShipmentPreparation.class);
        when(preparation.prepare(eq(ORDER), any())).thenReturn(NpFixtures.prepared(null));
        ShipmentCreation creation = NpFixtures.creation(preparation, writer, store, locks, orders,
                mock(SettingsService.class), cancellation);
        OrderShipment made = NpFixtures.api(ShipmentStage.CREATED);
        when(store.persistSafely(eq(ORDER), any(), any(), any())).thenReturn(made);
        when(writer.saveOnce(any())).thenAnswer(inv -> {
            // The reject commits now; its listener finds the lock busy and must not report a failure.
            cancellation.dropForClosedOrder(ORDER);
            when(orders.find(ORDER)).thenReturn(Optional.of(NpFixtures.order(OrderStatus.REJECTED, false, TTN)));
            when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.of(made));
            return NpFixtures.result();
        });

        creation.create(ORDER, Options.defaults());

        verify(writer, times(1)).delete(eq("np-ref-1"), eq(TTN), anyString());
        verify(store).deactivate(made.getId());
        verify(store, never()).syncError(any(), anyString());
    }

    @Test
    void anOrderStillOpenAfterTheCreateKeepsItsWaybill() {
        ShipmentPreparation preparation = mock(ShipmentPreparation.class);
        when(preparation.prepare(eq(ORDER), any())).thenReturn(NpFixtures.prepared(null));
        ShipmentCreation creation = NpFixtures.creation(preparation, writer, store, locks, orders,
                mock(SettingsService.class), cancellation);
        when(store.persistSafely(eq(ORDER), any(), any(), any())).thenReturn(NpFixtures.api(ShipmentStage.CREATED));
        when(writer.saveOnce(any())).thenReturn(NpFixtures.result());
        typed(TTN);

        creation.create(ORDER, Options.defaults());

        verify(writer, never()).delete(anyString(), anyString(), anyString());
        verify(store, never()).deactivate(any());
    }

    // --- 2d: a busy lock is not a failure

    @Test
    void aBusyLockDuringTheCleanUpIsNotReportedAsAFailedDelete() {
        activeApiCreated();

        try (DbLocks.Held ignored = holdLock()) {
            cancellation.dropForClosedOrder(ORDER);
        }

        verify(store, never()).syncError(any(), anyString());
        verify(writer, never()).delete(anyString(), anyString(), anyString());
        // Free again: the retry does the job.
        cancellation.dropForClosedOrder(ORDER);
        verify(writer).delete(eq("np-ref-1"), eq(TTN), anyString());
    }

    @Test
    void theInboxShowsARejectedOrdersWaybillOnlyAfterNpRefusedTheDelete() {
        ParcelIssues.ParcelLimits limits = new ParcelIssues.ParcelLimits(5, 2, 60);
        OrderShipment s = NpFixtures.api(ShipmentStage.CREATED);
        s.setCreatedAt(NpFixtures.now().minus(Duration.ofHours(1)));
        var rejected = NpFixtures.order(OrderStatus.REJECTED, false, TTN);

        assertThat(ParcelIssues.reason(s, rejected, NpFixtures.now(), limits)).isNull();

        s.setSyncError(ShipmentCancellation.CLOSED_ORDER + "timeout");
        ParcelIssues.Reason r = ParcelIssues.reason(s, rejected, NpFixtures.now(), limits);
        assertThat(r.kind()).isEqualTo("REJECTED_TTN");
        assertThat(r.text()).contains("не удалилась");
    }
}
