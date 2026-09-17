package com.maxsolch.shop.service;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.dto.MetricsDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Metrics are computed from a flat {@link MetricsRow} projection plus a grouped best-sellers query
 * (previously: full entities and a lazy items walk per order).
 */
@ExtendWith(MockitoExtension.class)
class MetricsServiceTest {

    @Mock
    OrderRepository orderRepository;
    @Mock
    OrderItemRepository orderItemRepository;

    MetricsService metricsService;

    private final Instant base = Instant.parse("2026-06-01T00:00:00Z");

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties();
        props.setTimezone("Europe/Kyiv");
        metricsService = new MetricsService(orderRepository, orderItemRepository, props);
        lenient().when(orderItemRepository.topProducts(any(), any())).thenReturn(List.of());
    }

    private MetricsRow row(OrderStatus status, long totalMinor, DeliveryMethod dm) {
        return new MetricsRow(status, totalMinor, "UAH", dm, null, base, null, null, null);
    }

    private MetricsRow row(OrderStatus status, long totalMinor, DeliveryMethod dm,
                           Instant approvedAt, Instant shippedAt, Instant deliveredAt) {
        return new MetricsRow(status, totalMinor, "UAH", dm, null, base,
                approvedAt, shippedAt, deliveredAt);
    }

    @Test
    void emptyList_yieldsZerosAndNullsWithoutNpe() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of());

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.totalOrders()).isZero();
        assertThat(dto.deliveredOrders()).isZero();
        assertThat(dto.revenueMinor()).isZero();
        assertThat(dto.avgOrderValueMinor()).isZero();
        assertThat(dto.currency()).isEqualTo("UAH"); // default when no orders
        assertThat(dto.range()).isEqualTo("month");
        // status counts all zero-filled for the 5 statuses
        assertThat(dto.statusCounts()).containsEntry("NEW", 0L)
                .containsEntry("APPROVED", 0L)
                .containsEntry("SHIPPED", 0L)
                .containsEntry("DELIVERED", 0L)
                .containsEntry("REJECTED", 0L);
        assertThat(dto.topProducts()).isEmpty();
        // delivery speed has no qualifying orders -> all null
        assertThat(dto.deliverySpeed().avgApproveHours()).isNull();
        assertThat(dto.deliverySpeed().avgShipHours()).isNull();
        assertThat(dto.deliverySpeed().avgDeliverHours()).isNull();
        assertThat(dto.deliverySpeed().avgTotalHours()).isNull();
    }

    @Test
    void revenueCountsOnlyDeliveredOrders() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                row(OrderStatus.DELIVERED, 10_000, DeliveryMethod.PICKUP),
                row(OrderStatus.DELIVERED, 5_000, DeliveryMethod.NOVA_POSHTA),
                row(OrderStatus.NEW, 99_999, DeliveryMethod.PICKUP),      // not delivered
                row(OrderStatus.SHIPPED, 88_888, DeliveryMethod.PICKUP)   // not delivered
        ));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.totalOrders()).isEqualTo(4);
        assertThat(dto.deliveredOrders()).isEqualTo(2);
        assertThat(dto.revenueMinor()).isEqualTo(15_000); // only delivered totals
        assertThat(dto.avgOrderValueMinor()).isEqualTo(7_500); // 15000/2
    }

    @Test
    void statusCountsReflectInput() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                row(OrderStatus.NEW, 1, DeliveryMethod.PICKUP),
                row(OrderStatus.NEW, 1, DeliveryMethod.PICKUP),
                row(OrderStatus.APPROVED, 1, DeliveryMethod.PICKUP),
                row(OrderStatus.DELIVERED, 1, DeliveryMethod.PICKUP),
                row(OrderStatus.REJECTED, 1, DeliveryMethod.PICKUP)
        ));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.newOrders()).isEqualTo(2);
        assertThat(dto.approvedOrders()).isEqualTo(1);
        assertThat(dto.deliveredOrders()).isEqualTo(1);
        assertThat(dto.rejectedOrders()).isEqualTo(1);
        assertThat(dto.shippedOrders()).isZero();
        assertThat(dto.statusCounts()).containsEntry("NEW", 2L)
                .containsEntry("APPROVED", 1L)
                .containsEntry("DELIVERED", 1L)
                .containsEntry("REJECTED", 1L)
                .containsEntry("SHIPPED", 0L);
    }

    @Test
    void deliveryMethodsBothZeroFilledThenCounted() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                row(OrderStatus.NEW, 1, DeliveryMethod.PICKUP),
                row(OrderStatus.NEW, 1, DeliveryMethod.NOVA_POSHTA),
                row(OrderStatus.NEW, 1, DeliveryMethod.NOVA_POSHTA)
        ));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.deliveryMethods())
                .containsEntry("PICKUP", 1L)
                .containsEntry("NOVA_POSHTA", 2L);
    }

    @Test
    void avgDeliverySpeedComputedFromTimestamps() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                row(OrderStatus.DELIVERED, 10_000, DeliveryMethod.PICKUP,
                        base.plus(2, ChronoUnit.HOURS),
                        base.plus(5, ChronoUnit.HOURS),
                        base.plus(11, ChronoUnit.HOURS))));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);
        MetricsDto.DeliverySpeed speed = dto.deliverySpeed();

        assertThat(speed.avgApproveHours()).isCloseTo(2.0, within(0.01));  // created->approved
        assertThat(speed.avgShipHours()).isCloseTo(3.0, within(0.01));     // approved->shipped
        assertThat(speed.avgDeliverHours()).isCloseTo(6.0, within(0.01));  // shipped->delivered
        assertThat(speed.avgTotalHours()).isCloseTo(11.0, within(0.01));   // created->delivered
    }

    @Test
    void deliverySpeedAveragesAcrossQualifyingOrders_skipsIncomplete() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                row(OrderStatus.DELIVERED, 1, DeliveryMethod.PICKUP,
                        base.plus(4, ChronoUnit.HOURS), null, null),
                row(OrderStatus.DELIVERED, 1, DeliveryMethod.PICKUP,
                        base.plus(6, ChronoUnit.HOURS), null, null),
                // no approvedAt -> excluded from the approve average
                row(OrderStatus.NEW, 1, DeliveryMethod.PICKUP)));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        // average of 4h and 6h = 5h, incomplete excluded
        assertThat(dto.deliverySpeed().avgApproveHours()).isCloseTo(5.0, within(0.01));
    }

    @Test
    void topProductsComeFromTheGroupedQuery() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                row(OrderStatus.DELIVERED, 0, DeliveryMethod.PICKUP)));
        when(orderItemRepository.topProducts(any(), any())).thenReturn(List.of(
                new Object[]{"Widget", 5L, 5_000L},
                new Object[]{"Gadget", 1L, 5_000L}));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.topProducts()).hasSize(2);
        MetricsDto.TopProduct top = dto.topProducts().get(0);
        assertThat(top.title()).isEqualTo("Widget");
        assertThat(top.qty()).isEqualTo(5);
        assertThat(top.revenueMinor()).isEqualTo(5_000);
    }

    @Test
    void currencyTakenFromFirstOrderWithCurrency() {
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                new MetricsRow(OrderStatus.NEW, 1, "USD", DeliveryMethod.PICKUP, null,
                        base, null, null, null)));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.currency()).isEqualTo("USD");
    }

    @Test
    void dayBucketsUseTheBusinessTimezoneNotUtc() {
        // 22:30 UTC on 2026-06-01 is 01:30 on 2026-06-02 in Kyiv (UTC+3 in summer).
        Instant lateEvening = Instant.parse("2026-06-01T22:30:00Z");
        when(orderRepository.findMetricsRows(any())).thenReturn(List.of(
                new MetricsRow(OrderStatus.NEW, 1_000, "UAH", DeliveryMethod.PICKUP, null,
                        lateEvening, null, null, null)));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.ordersByDay()).hasSize(1);
        assertThat(dto.ordersByDay().get(0).date()).isEqualTo("2026-06-02");
    }
}
