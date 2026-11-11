package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** «Внимание» → «Посылки»: which stage alone puts a parcel on the screen. */
class ParcelIssuesTest {

    @Test
    void parcelInboxReasons() {
        Instant now = Instant.parse("2026-10-23T10:00:00Z");
        OrderShipment s = new OrderShipment();
        s.setTtn("20450000000000");

        s.setStage(ShipmentStage.IN_TRANSIT.name());
        assertThat(ParcelIssues.reason(s, now, 5)).isNull();

        s.setStage(ShipmentStage.REFUSED.name());
        assertThat(ParcelIssues.reason(s, now, 5)).contains("Отказ").contains("Возврат");

        s.setStage(ShipmentStage.RETURNING.name());
        s.setReturnTtn("20450000000001");
        assertThat(ParcelIssues.reason(s, now, 5)).contains("ТТН возврата 20450000000001").contains("Возврат");

        s.setStage(ShipmentStage.ARRIVED.name());
        s.setArrivedAt(now.minus(Duration.ofDays(2)));
        assertThat(ParcelIssues.reason(s, now, 5)).isNull();
        s.setArrivedAt(now.minus(Duration.ofDays(6)));
        assertThat(ParcelIssues.reason(s, now, 5)).contains("6 дн.");

        s.setStage(ShipmentStage.CREATED.name());
        s.setCreatedAt(now.minus(Duration.ofHours(30)));
        assertThat(ParcelIssues.reason(s, now, 5)).isNull();
        s.setCreatedAt(now.minus(Duration.ofDays(3)));
        assertThat(ParcelIssues.reason(s, now, 5)).contains("не сдали");
    }
}
