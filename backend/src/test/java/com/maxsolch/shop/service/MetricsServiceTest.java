package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.dto.MetricsDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MetricsServiceTest {

    @Mock
    OrderRepository orderRepository;

    @InjectMocks
    MetricsService metricsService;

    private final Instant base = Instant.parse("2026-06-01T00:00:00Z");

    private Order order(OrderStatus status, long totalMinor, DeliveryMethod dm) {
        Order o = new Order();
        o.setStatus(status);
        o.setTotalMinor(totalMinor);
        o.setCurrency("UAH");
        o.setDeliveryMethod(dm);
        o.setCreatedAt(base);
        o.setItems(new ArrayList<>());
        return o;
    }

    private OrderItem item(String title, int qty, long priceMinor) {
        OrderItem it = new OrderItem();
        it.setTitleSnapshot(title);
        it.setQuantity(qty);
        it.setPriceMinorSnapshot(priceMinor);
        return it;
    }

    @BeforeEach
    void noop() {
        // each test stubs findForMetrics as needed
    }

    @Test
    void emptyList_yieldsZerosAndNullsWithoutNpe() {
        when(orderRepository.findForMetrics(any())).thenReturn(List.of());

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
        List<Order> orders = List.of(
                order(OrderStatus.DELIVERED, 10_000, DeliveryMethod.PICKUP),
                order(OrderStatus.DELIVERED, 5_000, DeliveryMethod.NOVA_POSHTA),
                order(OrderStatus.NEW, 99_999, DeliveryMethod.PICKUP),      // not delivered
                order(OrderStatus.SHIPPED, 88_888, DeliveryMethod.PICKUP)   // not delivered
        );
        when(orderRepository.findForMetrics(any())).thenReturn(orders);

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.totalOrders()).isEqualTo(4);
        assertThat(dto.deliveredOrders()).isEqualTo(2);
        assertThat(dto.revenueMinor()).isEqualTo(15_000); // only delivered totals
        assertThat(dto.avgOrderValueMinor()).isEqualTo(7_500); // 15000/2
    }

    @Test
    void statusCountsReflectInput() {
        List<Order> orders = List.of(
                order(OrderStatus.NEW, 1, DeliveryMethod.PICKUP),
                order(OrderStatus.NEW, 1, DeliveryMethod.PICKUP),
                order(OrderStatus.APPROVED, 1, DeliveryMethod.PICKUP),
                order(OrderStatus.DELIVERED, 1, DeliveryMethod.PICKUP),
                order(OrderStatus.REJECTED, 1, DeliveryMethod.PICKUP)
        );
        when(orderRepository.findForMetrics(any())).thenReturn(orders);

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
        List<Order> orders = List.of(
                order(OrderStatus.NEW, 1, DeliveryMethod.PICKUP),
                order(OrderStatus.NEW, 1, DeliveryMethod.NOVA_POSHTA),
                order(OrderStatus.NEW, 1, DeliveryMethod.NOVA_POSHTA)
        );
        when(orderRepository.findForMetrics(any())).thenReturn(orders);

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.deliveryMethods())
                .containsEntry("PICKUP", 1L)
                .containsEntry("NOVA_POSHTA", 2L);
    }

    @Test
    void avgDeliverySpeedComputedFromTimestamps() {
        Order o = order(OrderStatus.DELIVERED, 10_000, DeliveryMethod.PICKUP);
        o.setCreatedAt(base);
        o.setApprovedAt(base.plus(2, ChronoUnit.HOURS));
        o.setShippedAt(base.plus(5, ChronoUnit.HOURS));
        o.setDeliveredAt(base.plus(11, ChronoUnit.HOURS));
        when(orderRepository.findForMetrics(any())).thenReturn(List.of(o));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);
        MetricsDto.DeliverySpeed speed = dto.deliverySpeed();

        assertThat(speed.avgApproveHours()).isCloseTo(2.0, within(0.01));  // created->approved
        assertThat(speed.avgShipHours()).isCloseTo(3.0, within(0.01));     // approved->shipped
        assertThat(speed.avgDeliverHours()).isCloseTo(6.0, within(0.01));  // shipped->delivered
        assertThat(speed.avgTotalHours()).isCloseTo(11.0, within(0.01));   // created->delivered
    }

    @Test
    void deliverySpeedAveragesAcrossQualifyingOrders_skipsIncomplete() {
        Order full = order(OrderStatus.DELIVERED, 1, DeliveryMethod.PICKUP);
        full.setCreatedAt(base);
        full.setApprovedAt(base.plus(4, ChronoUnit.HOURS));

        Order full2 = order(OrderStatus.DELIVERED, 1, DeliveryMethod.PICKUP);
        full2.setCreatedAt(base);
        full2.setApprovedAt(base.plus(6, ChronoUnit.HOURS));

        Order incomplete = order(OrderStatus.NEW, 1, DeliveryMethod.PICKUP);
        incomplete.setCreatedAt(base); // no approvedAt -> excluded from approve avg

        when(orderRepository.findForMetrics(any()))
                .thenReturn(List.of(full, full2, incomplete));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        // average of 4h and 6h = 5h, incomplete excluded
        assertThat(dto.deliverySpeed().avgApproveHours()).isCloseTo(5.0, within(0.01));
    }

    @Test
    void topProductsAggregatedFromItemSnapshots() {
        Order a = order(OrderStatus.DELIVERED, 0, DeliveryMethod.PICKUP);
        a.getItems().add(item("Widget", 3, 1_000));
        a.getItems().add(item("Gadget", 1, 5_000));

        Order b = order(OrderStatus.NEW, 0, DeliveryMethod.PICKUP);
        b.getItems().add(item("Widget", 2, 1_000));

        when(orderRepository.findForMetrics(any())).thenReturn(List.of(a, b));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.topProducts()).hasSize(2);
        // sorted by qty desc: Widget (5) before Gadget (1)
        MetricsDto.TopProduct top = dto.topProducts().get(0);
        assertThat(top.title()).isEqualTo("Widget");
        assertThat(top.qty()).isEqualTo(5);
        assertThat(top.revenueMinor()).isEqualTo(5_000); // 5 * 1000
    }

    @Test
    void currencyTakenFromFirstOrderWithCurrency() {
        Order o = order(OrderStatus.NEW, 1, DeliveryMethod.PICKUP);
        o.setCurrency("USD");
        when(orderRepository.findForMetrics(any())).thenReturn(List.of(o));

        MetricsDto dto = metricsService.compute(TimeRange.MONTH);

        assertThat(dto.currency()).isEqualTo("USD");
    }
}
