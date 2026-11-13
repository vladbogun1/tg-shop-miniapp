package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ParcelLink;
import com.maxsolch.shop.delivery.domain.ShipmentStatusMapper;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.ParcelLinkRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Waybills NP made on the basis of ours (V103): found in the poll answer, tracked by themselves, never moving the order
 * (a return «отримано» is the shop picking it up). Synthetic numbers only.
 */
class LinkedParcelsTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant NOW = Instant.parse("2026-11-13T12:00:00Z");

    private final ParcelLinkRepository links = mock(ParcelLinkRepository.class);
    private final LinkedParcelNotifier notifier = mock(LinkedParcelNotifier.class);
    private final LinkedParcels linked = new LinkedParcels(links, notifier,
            new TransactionTemplate(mock(PlatformTransactionManager.class)), Clock.fixed(NOW, ZoneOffset.UTC));

    private final byte[] orderId = UuidUtil.randomBytes();
    private final OrderShipment ours = new OrderShipment();

    @BeforeEach
    void setUp() {
        ours.setId(UuidUtil.randomBytes());
        ours.setOrderId(orderId);
        ours.setTtn("20450000000001");
        when(links.findByTtn(anyString())).thenReturn(Optional.empty());
    }

    private static JsonNode node(String json) throws Exception {
        return JSON.readTree(json);
    }

    @Test
    void foundReadsTheBasisTypeAndTheLightReturn() throws Exception {
        assertThat(LinkedParcels.found(ours, node("""
                {"LastCreatedOnTheBasisNumber":"59000000000002","LastCreatedOnTheBasisDocumentType":"CargoReturn"}""")))
                .containsExactly(new LinkedParcels.Spotted(ParcelLink.Kind.RETURN, "59000000000002"));
        assertThat(LinkedParcels.found(ours, node("""
                {"LastCreatedOnTheBasisNumber":"59000000000003","LastCreatedOnTheBasisDocumentType":"Redirecting"}""")))
                .containsExactly(new LinkedParcels.Spotted(ParcelLink.Kind.REDIRECT, "59000000000003"));
        assertThat(LinkedParcels.found(ours, node("""
                {"LastCreatedOnTheBasisNumber":"","LightReturnNumber":"59000000000004"}""")))
                .containsExactly(new LinkedParcels.Spotted(ParcelLink.Kind.LIGHT_RETURN, "59000000000004"));
    }

    @Test
    void foundSkipsOtherTypesOurOwnNumberBlanksAndDemoNumbers() throws Exception {
        assertThat(LinkedParcels.found(ours, node("""
                {"LastCreatedOnTheBasisNumber":"59000000000005","LastCreatedOnTheBasisDocumentType":"Redelivery"}""")))
                .isEmpty();
        assertThat(LinkedParcels.found(ours, node("""
                {"LastCreatedOnTheBasisNumber":"20450000000001","LastCreatedOnTheBasisDocumentType":"CargoReturn",
                 "LightReturnNumber":"0"}"""))).isEmpty();
        assertThat(LinkedParcels.found(ours, node("""
                {"LastCreatedOnTheBasisNumber":"DRY12345","LastCreatedOnTheBasisDocumentType":"CargoReturn"}""")))
                .isEmpty();
        assertThat(LinkedParcels.found(ours, node("{}"))).isEmpty();
    }

    @Test
    void discoverSavesOnceAndTellsAboutALightReturn() throws Exception {
        JsonNode n = node("""
                {"LastCreatedOnTheBasisNumber":"59000000000002","LastCreatedOnTheBasisDocumentType":"CargoReturn",
                 "LightReturnNumber":"59000000000004"}""");
        linked.discover(ours, n);
        ArgumentCaptor<ParcelLink> saved = ArgumentCaptor.forClass(ParcelLink.class);
        verify(links, times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(ParcelLink::getKind).containsExactly("RETURN", "LIGHT_RETURN");
        assertThat(saved.getAllValues().get(0).getShipmentId()).isEqualTo(ours.getId());
        assertThat(saved.getAllValues().get(0).getStage()).isEqualTo("CREATED");
        verify(notifier).lightReturnSent(org.mockito.ArgumentMatchers.argThat(l -> "59000000000004".equals(l.getTtn())));

        when(links.findByTtn("59000000000002")).thenReturn(Optional.of(link(ParcelLink.Kind.RETURN)));
        when(links.findByTtn("59000000000004")).thenReturn(Optional.of(link(ParcelLink.Kind.LIGHT_RETURN)));
        linked.discover(ours, n);
        verify(links, times(2)).save(any());
    }

    @Test
    void discoverLosingARaceIsQuiet() throws Exception {
        when(links.save(any())).thenThrow(new DataIntegrityViolationException("dup"));
        linked.discover(ours, node("{\"LightReturnNumber\":\"59000000000004\"}"));
        verify(notifier, never()).lightReturnSent(any());
    }

    @Test
    void returnArrivedTellsTheSellersOnce_withPaidStorage() {
        ParcelLink l = link(ParcelLink.Kind.RETURN);
        when(links.findById(l.getId())).thenReturn(Optional.of(l));
        linked.apply(l.getId(), ShipmentStatusMapper.stageOf("7"), "7", "Прибув у відділення", LocalDate.of(2026, 11, 18));
        assertThat(l.stageEnum()).isEqualTo(ShipmentStage.ARRIVED);
        assertThat(l.getArrivedAt()).isEqualTo(NOW);
        assertThat(l.getStoragePaidFrom()).isEqualTo(LocalDate.of(2026, 11, 18));
        verify(notifier).stageReached(l);
        assertThat(LinkedParcelNotifier.text(l, ShipmentStage.ARRIVED)).contains("Возврат ждёт").contains("18.11")
                .contains("Посылка вернулась");

        linked.apply(l.getId(), ShipmentStatusMapper.stageOf("8"), "8", "Прибув у відділення", null);
        verify(notifier, times(1)).stageReached(any());

        linked.apply(l.getId(), ShipmentStatusMapper.stageOf("9"), "9", "Відправлення отримано", null);
        assertThat(l.getReceivedAt()).isEqualTo(NOW);
        verify(notifier, times(2)).stageReached(l);
        // A late «прибув» after the pickup does not tell again.
        assertThat(l.claimNotice(ShipmentStage.ARRIVED)).isFalse();
    }

    @Test
    void redirectWaitingIsTheCustomersBusiness_pickedUpIsTold() {
        ParcelLink l = link(ParcelLink.Kind.REDIRECT);
        when(links.findById(l.getId())).thenReturn(Optional.of(l));
        linked.apply(l.getId(), ShipmentStatusMapper.stageOf("7"), "7", "Прибув у відділення", null);
        verify(notifier, never()).stageReached(any());
        linked.apply(l.getId(), ShipmentStatusMapper.stageOf("9"), "9", "Відправлення отримано", null);
        verify(notifier).stageReached(l);
        assertThat(LinkedParcelNotifier.text(l, ShipmentStage.RECEIVED)).contains("Переадресованную посылку забрали");
    }

    /** The design rule: a linked waybill's «отримано» never touches the order. */
    @Test
    void pollingALinkNeverMovesTheOrder() throws Exception {
        ShipmentOrders orders = mock(ShipmentOrders.class);
        NovaPoshtaGateway api = mock(NovaPoshtaGateway.class);
        SettingsService settings = mock(SettingsService.class);
        when(settings.getBool(anyString())).thenReturn(true);
        when(api.keyConfigured()).thenReturn(true);
        when(api.array()).thenAnswer(i -> JSON.createArrayNode());
        when(api.props()).thenAnswer(i -> JSON.createObjectNode());
        ShippingOrder o = mock(ShippingOrder.class);
        when(o.id()).thenReturn(orderId);
        when(o.phone()).thenReturn("+380670000001");
        when(orders.findAll(any())).thenReturn(List.of(o));
        ParcelLink back = link(ParcelLink.Kind.RETURN);
        ParcelLink dry = link(ParcelLink.Kind.RETURN);
        dry.setTtn("DRY100");
        when(links.findById(back.getId())).thenReturn(Optional.of(back));
        when(links.findById(dry.getId())).thenReturn(Optional.of(dry));
        when(links.findDueForPoll(any(), any(), any(), any())).thenReturn(List.of(back, dry));
        when(api.call(eq("TrackingDocument"), eq("getStatusDocuments"), any(JsonNode.class))).thenReturn(node("""
                [{"Number":"59000000000002","StatusCode":"9","Status":"Відправлення отримано"}]"""));

        int n = new LinkedParcelPolling(links, linked, orders, api, settings, Clock.fixed(NOW, ZoneOffset.UTC))
                .pollDue();

        assertThat(n).isEqualTo(2);
        assertThat(back.stageEnum()).isEqualTo(ShipmentStage.RECEIVED);
        assertThat(dry.getLastPolledAt()).isEqualTo(NOW);
        assertThat(dry.stageEnum()).isEqualTo(ShipmentStage.CREATED);
        ArgumentCaptor<JsonNode> req = ArgumentCaptor.forClass(JsonNode.class);
        verify(api).call(eq("TrackingDocument"), eq("getStatusDocuments"), req.capture());
        assertThat(req.getValue().get("Documents")).hasSize(1);
        assertThat(req.getValue().get("Documents").get(0).get("Phone").asText()).isEqualTo("380670000001");
        verify(orders, never()).markDelivered(any(), anyLong());
        verify(orders, never()).markShipped(any(), any());
    }

    @Test
    void pollingIsOffWithTheTracking() {
        SettingsService settings = mock(SettingsService.class);
        NovaPoshtaGateway api = mock(NovaPoshtaGateway.class);
        when(api.keyConfigured()).thenReturn(true);
        assertThat(new LinkedParcelPolling(links, linked, mock(ShipmentOrders.class), api, settings,
                Clock.fixed(NOW, ZoneOffset.UTC)).pollDue()).isZero();
        verify(links, never()).findDueForPoll(any(), any(), any(), any());
    }

    @Test
    void issues_returnWaitsThenPicked_goneWhenAccepted() {
        ParcelLink l = link(ParcelLink.Kind.RETURN);
        l.report(ShipmentStage.ARRIVED, "7", "Прибув", LocalDate.of(2026, 11, 18), NOW);
        ParcelIssues.Reason r = LinkedParcelIssues.reason(l, order(OrderStatus.REJECTED, "IN_TRANSIT"));
        assertThat(r.kind()).isEqualTo("RETURN_WAITING");
        assertThat(r.urgent()).isTrue();
        assertThat(r.text()).contains("18.11");

        l.report(ShipmentStage.RECEIVED, "9", "Отримано", null, NOW);
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.REJECTED, "IN_TRANSIT")).kind())
                .isEqualTo("RETURN_PICKED");
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.REJECTED, "RECEIVED"))).isNull();
    }

    @Test
    void issues_returnOnItsWay_isTheParcelsOwnRow() {
        ParcelLink l = link(ParcelLink.Kind.RETURN);
        l.report(ShipmentStage.IN_TRANSIT, "5", "В дорозі", null, NOW);
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.SHIPPED, null))).isNull();
    }

    @Test
    void issues_lightReturnOfADeliveredOrder() {
        ParcelLink l = link(ParcelLink.Kind.LIGHT_RETURN);
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.DELIVERED, null)).kind()).isEqualTo("LIGHT_RETURN");
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.DELIVERED, "RECEIVED"))).isNull();
    }

    @Test
    void issues_redirect() {
        ParcelLink l = link(ParcelLink.Kind.REDIRECT);
        l.report(ShipmentStage.ARRIVED, "7", "Прибув", null, NOW);
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.SHIPPED, null))).isNull();
        l.report(ShipmentStage.RECEIVED, "9", "Отримано", null, NOW);
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.SHIPPED, null)).kind())
                .isEqualTo("REDIRECT_RECEIVED");
        assertThat(LinkedParcelIssues.reason(l, order(OrderStatus.DELIVERED, null))).isNull();

        ParcelLink back = link(ParcelLink.Kind.REDIRECT);
        back.report(ShipmentStage.RETURNING, "102", "Відмова", null, NOW);
        // Same kind as the parcel's own refusal: «Едет назад» on the row.
        assertThat(LinkedParcelIssues.reason(back, order(OrderStatus.SHIPPED, null)).kind()).isEqualTo("RETURNING");
    }

    @Test
    void theButtonDependsOnTheKindAndTheOrder() {
        assertThat(LinkedParcelIssues.acceptHint(ParcelLink.Kind.RETURN, order(OrderStatus.SHIPPED, null)))
                .contains("«Едет назад», затем «Посылка вернулась»");
        assertThat(LinkedParcelIssues.acceptHint(ParcelLink.Kind.RETURN, order(OrderStatus.REJECTED, "IN_TRANSIT")))
                .isEqualTo("отметьте в заказе «Посылка вернулась»");
        assertThat(LinkedParcelIssues.acceptHint(ParcelLink.Kind.LIGHT_RETURN, order(OrderStatus.DELIVERED, null)))
                .contains("«Возврат»");
        ParcelLink light = link(ParcelLink.Kind.LIGHT_RETURN);
        light.report(ShipmentStage.RECEIVED, "9", "Відправлення отримано", null, NOW);
        assertThat(LinkedParcelNotifier.text(light, ShipmentStage.RECEIVED)).contains("«Возврат»")
                .doesNotContain("Посылка вернулась");
        // «Возврат» with «едет назад» already done: the next button is «Посылка вернулась».
        assertThat(LinkedParcelIssues.acceptHint(ParcelLink.Kind.LIGHT_RETURN, order(OrderStatus.DELIVERED, "IN_TRANSIT")))
                .isEqualTo("отметьте в заказе «Посылка вернулась»");
    }

    @Test
    void aReturnAfterPickupTakenStraightToStockLeavesAttention() {
        ParcelLink light = link(ParcelLink.Kind.LIGHT_RETURN);
        light.report(ShipmentStage.ARRIVED, "7", "Прибув у відділення", null, NOW);
        ShippingOrder open = order(OrderStatus.DELIVERED, null);
        when(open.lines()).thenReturn(List.of(line(0)));
        ShippingOrder done = order(OrderStatus.DELIVERED, null);
        when(done.lines()).thenReturn(List.of(line(1)));
        ShippingOrder onTheWay = order(OrderStatus.DELIVERED, "IN_TRANSIT");
        when(onTheWay.lines()).thenReturn(List.of(line(0)));

        assertThat(LinkedParcelIssues.reason(light, open)).isNotNull();
        assertThat(LinkedParcelIssues.reason(light, done)).isNull();
        assertThat(LinkedParcelIssues.reason(light, onTheWay).text()).contains("«Посылка вернулась»");
        ParcelLink sent = link(ParcelLink.Kind.LIGHT_RETURN);
        assertThat(LinkedParcelIssues.reason(sent, onTheWay)).isNull();
    }

    private static ShippingOrder.Line line(int returned) {
        return new ShippingOrder.Line("p1", null, "Коврик", null, 1, returned, 100_000, false);
    }

    @Test
    void aLongStatusCodeFitsItsColumn() {
        ParcelLink l = link(ParcelLink.Kind.RETURN);
        l.report(ShipmentStage.IN_TRANSIT, "123456789012", null, null, NOW);
        assertThat(l.getStatusCode()).isEqualTo("12345678");
    }

    @Test
    void aRedirectIsNotTheParcelsReturnNumber() throws Exception {
        assertThat(ShipmentTrackingService.parse(node("""
                {"StatusCode":"104","LastCreatedOnTheBasisNumber":"59000000000003",
                 "LastCreatedOnTheBasisDocumentType":"Redirecting"}""")).returnTtn()).isNull();
        assertThat(ShipmentTrackingService.parse(node("""
                {"StatusCode":"104","LastCreatedOnTheBasisNumber":"59000000000002",
                 "LastCreatedOnTheBasisDocumentType":"CargoReturn"}""")).returnTtn()).isEqualTo("59000000000002");
    }

    @Test
    void kindOfNpTypes() {
        assertThat(ParcelLink.Kind.ofBasisType("CargoReturn")).isEqualTo(ParcelLink.Kind.RETURN);
        assertThat(ParcelLink.Kind.ofBasisType(" Return ")).isEqualTo(ParcelLink.Kind.RETURN);
        assertThat(ParcelLink.Kind.ofBasisType("Redirecting")).isEqualTo(ParcelLink.Kind.REDIRECT);
        assertThat(ParcelLink.Kind.ofBasisType("Utilization")).isNull();
        assertThat(ParcelLink.Kind.ofBasisType(null)).isNull();
    }

    @Test
    void aReturnTheOrderAlreadyAcceptedStaysQuiet() {
        // The first poll after the release finds old returns too: the sellers hear only what the order still waits for.
        var seller = mock(com.maxsolch.shop.notification.app.SellerChannel.class);
        var orderLookup = mock(com.maxsolch.shop.order.app.ShipmentOrders.class);
        LinkedParcelNotifier real = new LinkedParcelNotifier(seller, orderLookup);
        ParcelLink l = link(ParcelLink.Kind.RETURN);
        l.report(ShipmentStage.RECEIVED, "9", "Отримано", null, java.time.Instant.parse("2026-11-13T12:00:00Z"));

        ShippingOrder accepted = order(OrderStatus.SHIPPED, "RECEIVED");
        ShippingOrder waiting = order(OrderStatus.SHIPPED, null);
        when(orderLookup.find(orderId)).thenReturn(Optional.of(accepted));
        real.stageReached(l);
        real.lightReturnSent(link(ParcelLink.Kind.LIGHT_RETURN));
        verify(seller, never()).post(any(), any(), any(), any(), any());

        when(orderLookup.find(orderId)).thenReturn(Optional.of(waiting));
        real.stageReached(l);
        verify(seller, times(1)).post(any(), any(), any(), any(), any());
    }

    private ParcelLink link(ParcelLink.Kind kind) {
        ParcelLink l = new ParcelLink(orderId, ours.getId(), kind, "59000000000002");
        l.setId(UuidUtil.randomBytes());
        return l;
    }

    private ShippingOrder order(OrderStatus status, String returnStatus) {
        ShippingOrder o = mock(ShippingOrder.class);
        when(o.id()).thenReturn(orderId);
        when(o.status()).thenReturn(status);
        when(o.returnStatus()).thenReturn(returnStatus);
        return o;
    }
}
