package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static com.maxsolch.shop.analytics.metrics.Fx.order;
import static org.assertj.core.api.Assertions.assertThat;

/** «К отправке» on the "Today" strip. */
class TodayQueueTest {

    private final Instant at = Instant.parse("2026-10-10T10:00:00Z");

    @Test
    void approvedButUnpaidOnlineOrder_isNotReadyToShip() {
        var unpaidPrepay = order(at).status(OrderStatus.APPROVED).online(100_00).build();
        var paidPrepay = order(at).status(OrderStatus.APPROVED).online(100_00).paidOnline(at, 100_00).build();
        var oldCod = order(at).status(OrderStatus.APPROVED).build();
        var fresh = order(at).status(OrderStatus.NEW).build();

        assertThat(AdminMetricsService.readyToShip(unpaidPrepay)).isFalse();
        assertThat(AdminMetricsService.readyToShip(paidPrepay)).isTrue();
        assertThat(AdminMetricsService.readyToShip(oldCod)).isTrue();
        assertThat(AdminMetricsService.readyToShip(fresh)).isFalse();
    }
}
