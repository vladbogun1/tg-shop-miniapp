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
}
