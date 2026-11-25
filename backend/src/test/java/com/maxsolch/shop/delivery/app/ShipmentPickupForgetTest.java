package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** An order switched to a pickup in the admin: its typed-in waybill stops being tracked («ТТН не найдена» goes). */
class ShipmentPickupForgetTest {

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final ShipmentLocks locks = NpFixtures.locks(new InMemoryLockProvider());
    private final ShipmentManualSync manual = new ShipmentManualSync(orders, shipments, new NpFixtures.DirectTx(),
            locks, NpFixtures.cancellation(shipments, mock(NpWaybillWriter.class), mock(ShipmentStore.class), locks));

    private OrderShipment active(String origin) {
        OrderShipment s = NpFixtures.shipment(origin, ShipmentStage.NOT_FOUND, "20202020202020");
        when(shipments.findByOrderIdInAndActiveTrue(List.of(ORDER))).thenReturn(List.of(s));
        return s;
    }

    @Test
    void aPickupForgetsItsTypedWaybill() {
        OrderShipment typed = active(OrderShipment.ORIGIN_MANUAL);
        when(orders.find(ORDER)).thenReturn(Optional.of(
                NpFixtures.order(OrderStatus.DELIVERED, false, null, DeliveryMethod.PICKUP)));

        manual.forgetForPickup(ORDER);

        assertThat(typed.isActive()).isFalse();
    }

    @Test
    void ourWaybillIsNotTouchedHere() {
        OrderShipment ours = active(OrderShipment.ORIGIN_API);
        when(orders.find(ORDER)).thenReturn(Optional.of(
                NpFixtures.order(OrderStatus.APPROVED, false, null, DeliveryMethod.PICKUP)));

        manual.forgetForPickup(ORDER);

        assertThat(ours.isActive()).isTrue();
    }

    @Test
    void aNovaPoshtaOrderKeepsItsWaybill() {
        when(orders.find(ORDER)).thenReturn(Optional.of(
                NpFixtures.order(OrderStatus.SHIPPED, false, "20202020202020")));

        manual.forgetForPickup(ORDER);

        verify(shipments, never()).findByOrderIdInAndActiveTrue(any());
    }
}
