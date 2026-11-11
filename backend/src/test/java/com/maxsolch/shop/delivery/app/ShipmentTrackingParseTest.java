package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** Reading NP's getStatusDocuments rows and dates. */
class ShipmentTrackingParseTest {

    @Test
    void npDates() {
        assertThat(ShipmentTrackingService.date("2026-10-24 00:00:00")).isEqualTo(LocalDate.of(2026, 10, 24));
        assertThat(ShipmentTrackingService.date("24.10.2026 13:00:00")).isEqualTo(LocalDate.of(2026, 10, 24));
        assertThat(ShipmentTrackingService.date("24.10.2026")).isEqualTo(LocalDate.of(2026, 10, 24));
        assertThat(ShipmentTrackingService.date("2026-10-24")).isEqualTo(LocalDate.of(2026, 10, 24));
        assertThat(ShipmentTrackingService.date("0001-01-01 00:00:00")).isNull();
        assertThat(ShipmentTrackingService.date("")).isNull();
        assertThat(ShipmentTrackingService.date("завтра")).isNull();
    }

    @Test
    void parsesAStatusRow() throws Exception {
        var n = new ObjectMapper().readTree("""
                {"Number":"20450000000000","StatusCode":"7","Status":"Прибув у відділення",
                 "ScheduledDeliveryDate":"24.10.2026 13:00:00","DateFirstDayStorage":"2026-10-30",
                 "LastCreatedOnTheBasisNumber":""}""");
        ShipmentStatusApplier.StatusUpdate u = ShipmentTrackingService.parse(n);
        assertThat(u.code()).isEqualTo("7");
        assertThat(u.text()).isEqualTo("Прибув у відділення");
        assertThat(u.scheduledDelivery()).isEqualTo(LocalDate.of(2026, 10, 24));
        assertThat(u.storagePaidFrom()).isEqualTo(LocalDate.of(2026, 10, 30));
        assertThat(u.returnTtn()).isNull();
    }
}
