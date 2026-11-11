package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static com.maxsolch.shop.delivery.app.NpFixtures.TTN;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The tracking tick retries the clean-ups a busy lock postponed, and nothing else. */
class ShipmentCleanupSweepTest {

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final ShipmentCancellation cancellation = mock(ShipmentCancellation.class);
    private final ShipmentManualSync manual = mock(ShipmentManualSync.class);
    private final ShipmentCleanupSweep sweep = new ShipmentCleanupSweep(shipments, orders, cancellation, manual);

    private static OrderShipment ours() {
        return NpFixtures.api(ShipmentStage.CREATED);
    }

    @Test
    void whatIsLeftToDoDependsOnTheOrder() {
        assertThat(ShipmentCleanupSweep.action(ours(), NpFixtures.order(OrderStatus.REJECTED, false, TTN)))
                .isEqualTo(ShipmentCleanupSweep.Action.DROP);
        assertThat(ShipmentCleanupSweep.action(ours(), NpFixtures.order(OrderStatus.APPROVED, true, TTN)))
                .isEqualTo(ShipmentCleanupSweep.Action.DROP);
        assertThat(ShipmentCleanupSweep.action(ours(), NpFixtures.order(OrderStatus.SHIPPED, false, "590 0000 0000 01")))
                .isEqualTo(ShipmentCleanupSweep.Action.SWAP);
        assertThat(ShipmentCleanupSweep.action(ours(), NpFixtures.order(OrderStatus.APPROVED, false, TTN)))
                .isEqualTo(ShipmentCleanupSweep.Action.NONE);
        // Cleared number (an exchange, or an admin emptying the field): left alone.
        assertThat(ShipmentCleanupSweep.action(ours(), NpFixtures.order(OrderStatus.APPROVED, false, null)))
                .isEqualTo(ShipmentCleanupSweep.Action.NONE);
    }

    @Test
    void aClosedOrdersWaybillIsDroppedAgain() {
        when(shipments.findActiveInStages(anyCollection())).thenReturn(List.of(ours()));
        when(orders.findAll(any())).thenReturn(List.of(NpFixtures.order(OrderStatus.REJECTED, false, TTN)));

        assertThat(sweep.run()).isEqualTo(1);
        verify(cancellation).dropForClosedOrder(ORDER);
        verifyNoInteractions(manual);
    }

    @Test
    void aRenumberedOrderGetsItsSwapAgain() {
        when(shipments.findActiveInStages(anyCollection())).thenReturn(List.of(ours()));
        when(orders.findAll(any())).thenReturn(List.of(NpFixtures.order(OrderStatus.SHIPPED, false, "59000000000001")));

        assertThat(sweep.run()).isEqualTo(1);
        verify(manual).sync(ORDER);
        verify(cancellation, never()).dropForClosedOrder(any());
    }

    @Test
    void aRealFailureTypedInOrHandedOverWaybillsAreNotRetried() {
        OrderShipment failed = ours();
        failed.setSyncError(ShipmentCancellation.CLOSED_ORDER + "timeout");
        OrderShipment typed = NpFixtures.shipment(OrderShipment.ORIGIN_MANUAL, ShipmentStage.CREATED, TTN);
        when(shipments.findActiveInStages(anyCollection())).thenReturn(List.of(failed, typed));

        assertThat(sweep.run()).isZero();
        verifyNoInteractions(orders, cancellation, manual);
    }
}
