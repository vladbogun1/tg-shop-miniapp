package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A waybill backfilled by the migration (quiet) only catches up on its first status — except a parcel already
 * picked up whose order owes nothing: that order closes as DELIVERED (no money to book). One with money owed
 * stays for the admin.
 */
class ShipmentBackfillCatchUpTest {

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final SettingsService settings = mock(SettingsService.class);
    private final ShipmentStatusApplier applier = new ShipmentStatusApplier(shipments, orders, settings,
            mock(ShipmentNotifier.class), mock(NpAlerts.class),
            new TransactionTemplate(mock(PlatformTransactionManager.class)),
            Clock.fixed(Instant.parse("2026-11-12T06:00:00Z"), ZoneOffset.UTC));

    private final byte[] orderId = {1, 2, 3};
    private final byte[] shipmentId = {9};

    @BeforeEach
    void setUp() {
        when(settings.getBool(anyString())).thenReturn(true);
        when(settings.getString(anyString())).thenReturn("");
        OrderShipment s = new OrderShipment();
        s.setOrderId(orderId);
        s.setTtn("20450000000001");
        s.setQuiet(true);
        s.setOrigin(OrderShipment.ORIGIN_MANUAL); // V98 backfills typed-in numbers
        when(shipments.findById(any())).thenReturn(Optional.of(s));
    }

    private void orderOwes(long codMinor, long amountDueMinor) {
        ShippingOrder o = mock(ShippingOrder.class);
        when(o.codMinor()).thenReturn(codMinor);
        when(o.amountDueMinor()).thenReturn(amountDueMinor);
        when(o.phone()).thenReturn("+380671234567");
        when(orders.find(orderId)).thenReturn(Optional.of(o));
    }

    private ShipmentStatusApplier.StatusUpdate status(String code) {
        return status(code, "380671234567");
    }

    private ShipmentStatusApplier.StatusUpdate status(String code, String recipientPhone) {
        return new ShipmentStatusApplier.StatusUpdate(code, "test", null, null, null,
                Instant.parse("2026-11-10T10:00:00Z"), recipientPhone);
    }

    @Test
    void pickedUpAndPaid_closesTheOrder() {
        orderOwes(0, 0);
        applier.apply(shipmentId, status("9"), true);
        verify(orders).markDelivered(orderId, 0L);
    }

    @Test
    void pickedUpWithMoneyOwed_staysForTheAdmin() {
        orderOwes(150_000, 0);
        applier.apply(shipmentId, status("9"), true);
        verify(orders, never()).markDelivered(any(), anyLong());
    }

    @Test
    void someoneElsesParcel_doesNotCloseTheOrder() {
        orderOwes(0, 0);
        applier.apply(shipmentId, status("9", "380509999999"), true);
        verify(orders, never()).markDelivered(any(), anyLong());
    }

    @Test
    void stillOnTheWay_onlyCatchesUp() {
        orderOwes(0, 0);
        applier.apply(shipmentId, status("5"), true);
        verify(orders, never()).markDelivered(any(), anyLong());
        verify(orders, never()).markShipped(any(), any());
    }
}
