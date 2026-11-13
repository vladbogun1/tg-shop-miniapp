package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.domain.NpMeasure;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.domain.ShipmentStatusMapper;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A parcel with «Контроль оплати» closes its order only when the poll shows NP collected all of it (13.11.2026: a
 * partial pickup was booked as fully paid). A webhook «received» carries no amount and no phone: the order waits for
 * the poll, which asks again about parcels picked up lately. Synthetic numbers only.
 */
class PickupMoneyTest {

    private static final long COD = 1_440_000;
    private static final Instant NOW = Instant.parse("2026-11-13T12:00:00Z");

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final SettingsService settings = mock(SettingsService.class);
    private final ShipmentStatusApplier applier = new ShipmentStatusApplier(shipments, orders, settings,
            mock(ShipmentNotifier.class), mock(NpAlerts.class),
            new TransactionTemplate(mock(PlatformTransactionManager.class)), Clock.fixed(NOW, ZoneOffset.UTC));

    private final byte[] orderId = com.maxsolch.shop.platform.util.UuidUtil.randomBytes();
    private final byte[] shipmentId = com.maxsolch.shop.platform.util.UuidUtil.randomBytes();
    private final OrderShipment s = new OrderShipment();

    @BeforeEach
    void setUp() {
        when(settings.getBool(anyString())).thenReturn(true);
        when(settings.getString(anyString())).thenReturn("");
        s.setId(shipmentId);
        s.setOrderId(orderId);
        s.setTtn("20450000000001");
        s.setOrigin(OrderShipment.ORIGIN_API);
        s.setStage(ShipmentStage.ARRIVED.name());
        s.setCodMinor(COD);
        s.setCollectCod(true);
        when(shipments.findById(any())).thenReturn(Optional.of(s));
        ShippingOrder o = mock(ShippingOrder.class);
        when(o.id()).thenReturn(orderId);
        when(o.status()).thenReturn(OrderStatus.SHIPPED);
        when(o.phone()).thenReturn("+380670000001");
        when(o.codMinor()).thenReturn(COD);
        when(orders.find(orderId)).thenReturn(Optional.of(o));
    }

    private static ShipmentStatusApplier.StatusUpdate update(String code, Long collected, String phone) {
        return new ShipmentStatusApplier.StatusUpdate(code, "test", null, null, null, null, phone, NpMeasure.NONE,
                collected);
    }

    @Test
    void webhookPickupOfACollectingParcel_doesNotCloseTheOrder() {
        applier.apply(shipmentId, new ShipmentStatusApplier.StatusUpdate("9", "Отримано", null, null, null,
                NOW.minusSeconds(60)), false);
        assertThat(s.stageEnum()).isEqualTo(ShipmentStage.RECEIVED);
        verify(orders, never()).markDelivered(any(), anyLong());
    }

    @Test
    void pollWithAllTheMoney_closesTheOrderWithTheCod() {
        applier.apply(shipmentId, update("9", COD, null), true);
        verify(orders).markDelivered(orderId, COD);
        assertThat(s.getNpCollectedMinor()).isEqualTo(COD);
        assertThat(s.partlyCollected(COD)).isFalse();
    }

    @Test
    void pollWithLess_holdsTheOrderAndTellsTheAdmin() {
        applier.apply(shipmentId, update("9", 540_000L, null), true);
        verify(orders, never()).markDelivered(any(), anyLong());
        assertThat(s.getNpCollectedMinor()).isEqualTo(540_000L);
        assertThat(s.partlyCollected(COD)).isTrue();

        ParcelIssues.Reason r = ParcelIssues.reason(s, order(OrderStatus.SHIPPED), NOW, limits());
        assertThat(r.kind()).isEqualTo("PARTIAL_PICKUP");
        assertThat(r.urgent()).isTrue();
        assertThat(r.text()).contains("5").contains("14").contains("Не забрал на почте");
        // Once the admin settled the order, the row goes.
        assertThat(ParcelIssues.reason(s, order(OrderStatus.DELIVERED), NOW, limits())).isNull();
    }

    @Test
    void pollWithoutTheAmount_holds() {
        applier.apply(shipmentId, update("9", null, null), true);
        verify(orders, never()).markDelivered(any(), anyLong());
        assertThat(s.partlyCollected(COD)).isFalse(); // unknown, not partial: «Посылку забрали, а заказ «Отправлен»»
        assertThat(ParcelIssues.reason(s, order(OrderStatus.SHIPPED), NOW, limits()).kind())
                .isEqualTo("RECEIVED_SHIPPED");
    }

    @Test
    void amountBeforePickup_isNotStored() {
        applier.apply(shipmentId, update("7", COD, null), true);
        assertThat(s.getNpCollectedMinor()).isNull();
    }

    @Test
    void storedAmountDoesNotCloseAWebhookPickup() {
        s.setNpCollectedMinor(COD); // left from an earlier report
        applier.apply(shipmentId, update("9", null, null), false);
        verify(orders, never()).markDelivered(any(), anyLong());
    }

    @Test
    void nothingToCollect_webhookClosesAsBefore() {
        s.setCodMinor(0);
        s.setCollectCod(false);
        applier.apply(shipmentId, update("9", null, null), false);
        verify(orders).markDelivered(orderId, 0L);
    }

    @Test
    void typedInNumber_webhookWaits_thenThePollWithOurPhoneCloses() {
        s.setOrigin(OrderShipment.ORIGIN_MANUAL);
        s.setCodMinor(0);
        s.setCollectCod(false);
        applier.apply(shipmentId, update("9", null, null), false);
        verify(orders, never()).markDelivered(any(), anyLong());
        assertThat(s.stageEnum()).isEqualTo(ShipmentStage.RECEIVED);

        applier.apply(shipmentId, update("9", null, "380670000001"), true);
        verify(orders).markDelivered(orderId, 0L);
    }

    @Test
    void webhookThenPollWithAllTheMoney_closesOnce() {
        applier.apply(shipmentId, new ShipmentStatusApplier.StatusUpdate("9", "Отримано", null, null, null,
                NOW.minusSeconds(60)), false);
        verify(orders, never()).markDelivered(any(), anyLong());
        applier.apply(shipmentId, update("9", COD, null), true);
        verify(orders).markDelivered(orderId, COD);
    }

    /**
     * «Не забрал на почте» booked the partial pickup: the order now owes 5 400, the waybill still says 14 400. The
     * next poll with 5 400 collected closes the order on 5 400 — not held forever, «Внимание» row goes.
     */
    @Test
    void afterTheReturnWizard_theNextPollClosesOnWhatTheOrderOwes() {
        long bought = 540_000L;
        applier.apply(shipmentId, update("9", bought, null), true);
        verify(orders, never()).markDelivered(any(), anyLong());

        ShippingOrder settled = order(OrderStatus.SHIPPED, bought);
        when(orders.find(orderId)).thenReturn(Optional.of(settled));
        assertThat(s.partlyCollected(bought)).isFalse();
        assertThat(ParcelIssues.reason(s, settled, NOW, limits()).kind()).isEqualTo("RECEIVED_SHIPPED");

        applier.apply(shipmentId, update("9", bought, null), true);
        verify(orders).markDelivered(orderId, bought);
    }

    @Test
    void orderOwesNothing_closesWithoutMoney() {
        ShippingOrder paid = order(OrderStatus.SHIPPED, 0);
        when(orders.find(orderId)).thenReturn(Optional.of(paid));
        applier.apply(shipmentId, update("9", null, null), false);
        verify(orders).markDelivered(orderId, 0L);
    }

    @Test
    void webhookStatusKeepsThePollsReason() {
        assertThat(ShipmentStatusApplier.keepsReason("Відмова від отримання · Одержувач не з'явився",
                "Відмова від отримання")).isTrue();
        assertThat(ShipmentStatusApplier.keepsReason("Відмова від отримання · Одержувач не з'явився",
                "Прибув у відділення")).isFalse();
        assertThat(ShipmentStatusApplier.keepsReason(null, "Відмова")).isFalse();
        assertThat(ShipmentStatusApplier.keepsReason("Відмова · x", " ")).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"105", "113", "141", "144"})
    void storageEndedCodesAreUnclaimed(String code) {
        s.setStage(ShipmentStage.RETURNING.name());
        s.setStatusCode(code);
        s.setStatusText("Припинено зберігання");
        assertThat(ParcelIssues.reason(s, order(OrderStatus.SHIPPED), NOW, limits()).kind()).isEqualTo("UNCLAIMED");
    }

    @Test
    void code108IsARefusal() {
        assertThat(ShipmentStatusMapper.stageOf("108")).isEqualTo(ShipmentStage.REFUSED);
    }

    @Test
    void refusedOrUnclaimedParcelOfAShippedOrder_offersGoingBack() {
        s.setStage(ShipmentStage.RETURNING.name());
        s.setStatusText("Відмова від отримання · Одержувач не з'явився до відділення");
        ParcelIssues.Reason r = ParcelIssues.reason(s, order(OrderStatus.SHIPPED), NOW, limits());
        assertThat(r.kind()).isEqualTo("UNCLAIMED");
        assertThat(r.text()).contains("не забрал").contains("Едет назад");

        s.setStatusText("Відмова від отримання · Відмова від відправлення (для отримувача)");
        assertThat(ParcelIssues.reason(s, order(OrderStatus.SHIPPED), NOW, limits()).kind()).isEqualTo("RETURNING");

        s.setStage(ShipmentStage.REFUSED.name());
        assertThat(ParcelIssues.reason(s, order(OrderStatus.SHIPPED), NOW, limits()).kind()).isEqualTo("REFUSED");
        // Already rejected: the return wizard text, no «Едет назад».
        assertThat(ParcelIssues.reason(s, order(OrderStatus.REJECTED), NOW, limits()).text()).contains("Возврат");
    }

    @Test
    void unclaimedReadsAnyApostrophe() {
        assertThat(ParcelIssues.unclaimed("Одержувач не з’явився до відділення")).isTrue();
        assertThat(ParcelIssues.unclaimed("Одержувач не зʼявився до відділення")).isTrue();
        assertThat(ParcelIssues.unclaimed("Відмова від отримання")).isFalse();
        assertThat(ParcelIssues.unclaimed(null)).isFalse();
    }

    @ParameterizedTest
    @CsvSource(value = {"\"2100\",210000", "\"2100.00\",210000", "\"2330.5\",233050", "2100,210000",
            "\"\",", "\"0\",", "0,", "\"abc\",", "null,"}, nullValues = "")
    void collectedAmountInKopecks(String raw, Long expected) throws Exception {
        var n = new ObjectMapper().readTree("{\"StatusCode\":\"9\",\"Status\":\"Відправлення отримано\""
                + ("null".equals(raw) ? "" : ",\"AfterpaymentOnGoodsCost\":" + raw) + "}");
        assertThat(ShipmentTrackingService.parse(n).collectedMinor()).isEqualTo(expected);
    }

    @Test
    void undeliveryReasonJoinsTheStatusText() throws Exception {
        var n = new ObjectMapper().readTree("""
                {"StatusCode":"102","Status":"Відмова від отримання",
                 "UndeliveryReasons":"Одержувач не з'явився до відділення"}""");
        assertThat(ShipmentTrackingService.parse(n).text())
                .isEqualTo("Відмова від отримання · Одержувач не з'явився до відділення");
        var plain = new ObjectMapper().readTree("{\"StatusCode\":\"7\",\"Status\":\"Прибув у відділення\"}");
        assertThat(ShipmentTrackingService.parse(plain).text()).isEqualTo("Прибув у відділення");
    }

    @Test
    void recheckAsksOnlyAboutPickupsWhoseOrderStillWaits() {
        ShipmentTrackingService tracking = new ShipmentTrackingService(shipments, orders,
                mock(com.maxsolch.shop.delivery.domain.NovaPoshtaGateway.class), settings, applier,
                mock(ShipmentNotifier.class), mock(NpAlerts.class), null, null, Clock.fixed(NOW, ZoneOffset.UTC));
        OrderShipment other = new OrderShipment();
        byte[] otherOrder = com.maxsolch.shop.platform.util.UuidUtil.randomBytes();
        other.setOrderId(otherOrder);
        when(shipments.findReceivedSince(any(), any(), any(), any())).thenReturn(List.of(s, other));
        ShippingOrder delivered = mock(ShippingOrder.class);
        when(delivered.id()).thenReturn(otherOrder);
        when(delivered.status()).thenReturn(OrderStatus.DELIVERED);
        ShippingOrder shipped = orders.find(orderId).orElseThrow();
        when(orders.findAll(any())).thenReturn(List.of(shipped, delivered));
        assertThat(tracking.recheckReceived(NOW)).containsExactly(s);
        verify(shipments).findReceivedSince(ShipmentStage.RECEIVED.name(), NOW.minus(ShipmentTrackingService.RECHECK_RECEIVED),
                NOW.minus(ShipmentTrackingService.MIN_INTERVAL), org.springframework.data.domain.PageRequest.of(0, 1000));
    }

    private ShippingOrder order(OrderStatus status) {
        return order(status, COD);
    }

    private ShippingOrder order(OrderStatus status, long owes) {
        ShippingOrder o = mock(ShippingOrder.class);
        when(o.id()).thenReturn(orderId);
        when(o.status()).thenReturn(status);
        when(o.codMinor()).thenReturn(owes);
        return o;
    }

    private static ParcelIssues.ParcelLimits limits() {
        return new ParcelIssues.ParcelLimits(5, 2, 60);
    }
}
