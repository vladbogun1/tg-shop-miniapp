package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Optional;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static com.maxsolch.shop.delivery.app.NpFixtures.TTN;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The order was rejected, archived, merged away or exchanged back: only our waybill NP has no parcel for (CREATED,
 * origin API) is deleted at NP; a typed-in one or one NP already has is never touched; a failure is kept in
 * {@code sync_error} for «Внимание».
 */
class ShipmentCleanupTest {

    private final InMemoryLockProvider table = new InMemoryLockProvider();
    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final NpWaybillWriter writer = mock(NpWaybillWriter.class);
    private final ShipmentStore store = mock(ShipmentStore.class);
    private final ShipmentCancellation cancellation =
            NpFixtures.cancellation(shipments, writer, store, NpFixtures.locks(table));

    private void active(OrderShipment s) {
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.of(s));
    }

    @Test
    void ourWaybillWithoutAParcelIsDeletedAtNp() {
        OrderShipment s = NpFixtures.api(ShipmentStage.CREATED);
        active(s);

        cancellation.dropForClosedOrder(ORDER);

        verify(writer).delete(eq("np-ref-1"), eq(TTN), anyString());
        verify(store).deactivate(s.getId());
        verify(store).clearTracking(ORDER, TTN);
        verify(store, never()).syncError(any(), anyString());
    }

    @Test
    void aDryRunWaybillIsOnlyForgotten() {
        OrderShipment s = NpFixtures.api(ShipmentStage.CREATED);
        active(s);
        when(writer.dryRun()).thenReturn(true);

        cancellation.dropForClosedOrder(ORDER);

        verify(writer, never()).delete(anyString(), anyString(), anyString());
        verify(store).deactivate(s.getId());
    }

    @ParameterizedTest
    @EnumSource(value = ShipmentStage.class, names = {"IN_TRANSIT", "ARRIVED", "RECEIVED", "REFUSED", "RETURNING",
            "NOT_FOUND"})
    void aWaybillNpAlreadyHasIsNeverTouched(ShipmentStage stage) {
        active(NpFixtures.api(stage));

        cancellation.dropForClosedOrder(ORDER);

        verify(writer, never()).delete(anyString(), anyString(), anyString());
        verify(store, never()).deactivate(any());
        verify(store, never()).syncError(any(), anyString());
    }

    @Test
    void aTypedInWaybillIsNeverDeletedAtNp() {
        active(NpFixtures.shipment(OrderShipment.ORIGIN_MANUAL, ShipmentStage.CREATED, TTN));

        cancellation.dropForClosedOrder(ORDER);

        verify(writer, never()).delete(anyString(), anyString(), anyString());
        verify(store, never()).deactivate(any());
    }

    @Test
    void noWaybillNothingToDo() {
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.empty());

        cancellation.dropForClosedOrder(ORDER);

        verify(writer, never()).delete(anyString(), anyString(), anyString());
    }

    @Test
    void npRefusingTheDeleteIsKeptInSyncError() {
        OrderShipment s = NpFixtures.api(ShipmentStage.CREATED);
        active(s);
        doThrow(NovaPoshtaException.unavailable("timeout")).when(writer).delete(anyString(), anyString(), anyString());

        cancellation.dropForClosedOrder(ORDER);

        verify(store).syncError(eq(s.getId()), argThat(t -> t.contains("не удалилась") && t.contains("timeout")));
        verify(store, never()).deactivate(any());
    }
}
