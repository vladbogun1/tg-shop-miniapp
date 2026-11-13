package com.maxsolch.shop.order.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The parcel in the customer's order JSON carries no waybill internals (poll errors, staleness, box, origin…). */
class ShipmentBriefCustomerJsonTest {

    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());

    private static OrderShipmentView.ShipmentBrief full() {
        Instant t = Instant.parse("2026-11-12T10:00:00Z");
        return new OrderShipmentView.ShipmentBrief("20450000111222", "API", "WAREHOUSE", "ARRIVED", "7",
                "Прибув у відділення", LocalDate.parse("2026-11-13"), t, t, LocalDate.parse("2026-11-19"), "20459999",
                120_000, 8_000L, 900, 300, 200, 100, "https://novaposhta.ua/tracking/?cargo_number=20450000111222",
                t, t, t, "timeout", t, List.of("ADDRESS"), true);
    }

    private static List<String> keys(JsonNode node) {
        List<String> out = new ArrayList<>();
        node.fieldNames().forEachRemaining(out::add);
        return out;
    }

    @Test
    void customerCopy_onlyWhatTheCustomerReads() throws Exception {
        JsonNode node = json.valueToTree(full().forCustomer());

        assertThat(keys(node)).containsExactlyInAnyOrder("ttn", "stage", "statusText", "arrivedAt",
                "storagePaidFrom", "codMinor", "trackingUrl", "handedOver");
        assertThat(node.get("ttn").asText()).isEqualTo("20450000111222");
        assertThat(node.get("codMinor").asLong()).isEqualTo(120_000);
    }

    @Test
    void adminCopy_keepsEverything() throws Exception {
        JsonNode node = json.valueToTree(full());

        assertThat(keys(node)).contains("pollError", "staleReasons", "weightG", "origin", "printedAt",
                "scheduledDelivery");
        assertThat(keys(node)).hasSize(25);
    }

    @Test
    void packingIsAdminOnly() throws Exception {
        Instant t = Instant.parse("2026-11-12T10:00:00Z");
        OrderShipmentView.Packing packing = new OrderShipmentView.Packing("Коробка 5 кг · 13 см",
                "подобрано по размерам", "Коробка 5 кг · 8 см", "box-id", 80, t, "Пакувальник", true, false,
                "4", 5000, 5000, 1900, 19550L, t, null);
        OrderShipmentView.ShipmentBrief b = full();
        OrderShipmentView.ShipmentBrief admin = new OrderShipmentView.ShipmentBrief(b.ttn(), b.origin(),
                b.serviceType(), b.stage(), b.statusCode(), b.statusText(), b.scheduledDelivery(), b.arrivedAt(),
                b.receivedAt(), b.storagePaidFrom(), b.returnTtn(), b.codMinor(), b.deliveryCostMinor(), b.weightG(),
                b.lengthMm(), b.widthMm(), b.heightMm(), b.trackingUrl(), b.createdAt(), b.lastEventAt(),
                b.lastPolledAt(), b.pollError(), b.printedAt(), b.staleReasons(), b.handedOver(), packing);

        JsonNode adminJson = json.valueToTree(admin);
        assertThat(adminJson.get("packing").get("boxConfirmedBy").asText()).isEqualTo("Пакувальник");
        assertThat(keys(json.valueToTree(admin.forCustomer()))).doesNotContain("packing");
        assertThat(keys(json.valueToTree(b))).doesNotContain("packing");
    }
}
