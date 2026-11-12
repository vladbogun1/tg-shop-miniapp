package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.domain.NpMeasure;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * What NP measured at the branch (getStatusDocuments) lands in the np_* columns only once NP has the parcel
 * (code ≥ 4), never over our declared weight / sides, and also on the quiet (backfilled) path.
 */
class NpMeasureCaptureTest {

    private static final String SAMPLE = """
            {"Number":"20451585721066","StatusCode":"4","DocumentWeight":5,"FactualWeight":"1.90",
             "VolumeWeight":"5.00","CheckWeight":0,"CheckWeightMethod":"Volumetric","SeatsAmount":"1",
             "DocumentCost":"195.5"}""";
    private static final Instant NOW = Instant.parse("2026-11-12T06:00:00Z");

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final SettingsService settings = mock(SettingsService.class);
    private final ShipmentStatusApplier applier = new ShipmentStatusApplier(shipments, orders, settings,
            mock(ShipmentNotifier.class), mock(NpAlerts.class),
            new TransactionTemplate(mock(PlatformTransactionManager.class)), Clock.fixed(NOW, ZoneOffset.UTC));
    private OrderShipment row;

    @BeforeEach
    void setUp() {
        when(settings.getBool(anyString())).thenReturn(false);
        when(settings.getString(anyString())).thenReturn("");
        row = NpFixtures.api(com.maxsolch.shop.delivery.domain.ShipmentStage.CREATED);
        row.setStatusCode("1");
        row.setWeightG(1500);
        row.setLengthMm(400);
        row.setWidthMm(240);
        row.setHeightMm(80);
        when(shipments.findById(any())).thenReturn(Optional.of(row));
        when(orders.find(any())).thenReturn(Optional.of(mock(ShippingOrder.class)));
    }

    private static JsonNode sample(String code) throws Exception {
        return new ObjectMapper().readTree(SAMPLE.replace("\"StatusCode\":\"4\"", "\"StatusCode\":\"" + code + "\""));
    }

    @Test
    void theSampleRowParses() throws Exception {
        ShipmentStatusApplier.StatusUpdate u = ShipmentTrackingService.parse(sample("4"));
        assertThat(u.code()).isEqualTo("4");
        assertThat(u.measure()).isEqualTo(new NpMeasure(5000, 5000, 1900, 19550L));
        assertThat(NpMeasure.of(new ObjectMapper().readTree("{\"DocumentWeight\":\"0\",\"VolumeWeight\":\"\","
                + "\"FactualWeight\":\"1,25\",\"DocumentCost\":\"abc\"}")))
                .isEqualTo(new NpMeasure(null, null, 1250, null));
        assertThat(NpMeasure.accepted("3")).isFalse();
        assertThat(NpMeasure.accepted(" 9 ")).isTrue();
        assertThat(NpMeasure.accepted(null)).isFalse();
    }

    @Test
    void storedOnceNpHasTheParcelAndOurDeclarationStays() throws Exception {
        applier.apply(row.getId(), ShipmentTrackingService.parse(sample("4")), false);

        assertThat(row.getNpWeightG()).isEqualTo(5000);
        assertThat(row.getNpVolumeWeightG()).isEqualTo(5000);
        assertThat(row.getNpFactualWeightG()).isEqualTo(1900);
        assertThat(row.getNpCostMinor()).isEqualTo(19550L);
        assertThat(row.getNpMeasuredAt()).isEqualTo(NOW);
        assertThat(row.getWeightG()).isEqualTo(1500);
        assertThat(row.getHeightMm()).isEqualTo(80);
    }

    @Test
    void notStoredBeforeNpHasTheParcel() throws Exception {
        applier.apply(row.getId(), ShipmentTrackingService.parse(sample("1")), false);
        assertThat(row.getNpWeightG()).isNull();
        assertThat(row.getNpMeasuredAt()).isNull();
    }

    @Test
    void theQuietPathStoresItToo() throws Exception {
        row.setQuiet(true);
        applier.apply(row.getId(), ShipmentTrackingService.parse(sample("5")), true);
        assertThat(row.getNpCostMinor()).isEqualTo(19550L);
    }

    @Test
    void anEmptyLaterRowDoesNotWipeTheMeasure() throws Exception {
        applier.apply(row.getId(), ShipmentTrackingService.parse(sample("4")), false);
        applier.apply(row.getId(), new ShipmentStatusApplier.StatusUpdate("7", "Прибув", null, null, null,
                NOW, null, NpMeasure.NONE), false);
        assertThat(row.getNpWeightG()).isEqualTo(5000);
        assertThat(row.getNpCostMinor()).isEqualTo(19550L);
    }
}
