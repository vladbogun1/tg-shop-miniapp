package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Отменить ТТН» of a waybill deleted in the NP cabinet: NP's «no» does not keep it on the order. */
class ShipmentCancellationTest {

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final NpWaybillWriter writer = mock(NpWaybillWriter.class);
    private final ShipmentStore store = mock(ShipmentStore.class);
    private final ShipmentCancellation cancellation = NpFixtures.cancellation(shipments, writer, store,
            NpFixtures.locks(new InMemoryLockProvider()));

    private OrderShipment active(ShipmentStage stage) {
        OrderShipment s = NpFixtures.api(stage);
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(NpFixtures.ORDER)).thenReturn(Optional.of(s));
        return s;
    }

    @Test
    void aWaybillNpNoLongerFindsIsForgottenWhenNpRefusesToDeleteIt() {
        OrderShipment s = active(ShipmentStage.NOT_FOUND);
        doThrow(NovaPoshtaException.rejected("Document not found")).when(writer).delete(any(), any(), any());

        cancellation.cancel(NpFixtures.ORDER);

        verify(store).deactivate(s.getId());
        verify(store).clearTracking(NpFixtures.ORDER, s.getTtn());
    }

    @Test
    void npDownKeepsTheWaybillEvenIfNpDoesNotFindIt() {
        active(ShipmentStage.NOT_FOUND);
        doThrow(NovaPoshtaException.unavailable("timeout")).when(writer).delete(any(), any(), any());

        assertThatThrownBy(() -> cancellation.cancel(NpFixtures.ORDER)).isInstanceOf(NovaPoshtaException.class);
        verify(store, never()).deactivate(any());
    }

    @Test
    void aLiveWaybillNpRefusesToDeleteStays() {
        active(ShipmentStage.CREATED);
        doThrow(NovaPoshtaException.rejected("no")).when(writer).delete(any(), any(), any());

        assertThatThrownBy(() -> cancellation.cancel(NpFixtures.ORDER)).isInstanceOf(NovaPoshtaException.class);
        verify(store, never()).deactivate(any());
    }
}
