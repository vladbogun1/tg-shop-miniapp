package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.dto.MetricsDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;

/**
 * Computes admin analytics over orders in a {@link TimeRange}. Loads the range-bounded set of orders
 * (range-capped by the date filter) and aggregates in Java, accessing items lazily inside the
 * read-only transaction.
 */
@Service
public class MetricsService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String DEFAULT_CURRENCY = "UAH";
    private static final int TOP_PRODUCTS = 10;

    private final OrderRepository orderRepository;

    public MetricsService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)
    public MetricsDto compute(TimeRange range) {
        Instant from = range.from();
        List<Order> orders = orderRepository.findForMetrics(from);

        String currency = orders.stream()
                .map(Order::getCurrency)
                .filter(c -> c != null && !c.isBlank())
                .findFirst()
                .orElse(DEFAULT_CURRENCY);

        // Status counts (all five, zero-filled).
        Map<OrderStatus, Long> byStatus = new EnumMap<>(OrderStatus.class);
        for (OrderStatus s : OrderStatus.values()) {
            byStatus.put(s, 0L);
        }
        for (Order o : orders) {
            byStatus.merge(o.getStatus(), 1L, Long::sum);
        }
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (OrderStatus s : OrderStatus.values()) {
            statusCounts.put(s.name(), byStatus.get(s));
        }

        long totalOrders = orders.size();
        long deliveredOrders = byStatus.get(OrderStatus.DELIVERED);

        // Revenue = sum of total_minor for DELIVERED orders in range.
        long revenueMinor = orders.stream()
                .filter(o -> o.getStatus() == OrderStatus.DELIVERED)
                .mapToLong(Order::getTotalMinor)
                .sum();
        long avgOrderValueMinor = deliveredOrders == 0 ? 0 : revenueMinor / deliveredOrders;

        // Per-day buckets (UTC). TreeMap keeps chronological ordering by yyyy-MM-dd key.
        Map<String, long[]> revenuePerDay = new TreeMap<>(); // [revenueMinor, ordersCount]
        Map<String, Long> ordersPerDay = new TreeMap<>();
        for (Order o : orders) {
            String day = dayOf(o.getCreatedAt());
            ordersPerDay.merge(day, 1L, Long::sum);
            if (o.getStatus() == OrderStatus.DELIVERED) {
                long[] acc = revenuePerDay.computeIfAbsent(day, k -> new long[2]);
                acc[0] += o.getTotalMinor();
                acc[1] += 1;
            }
        }
        List<MetricsDto.RevenueByDay> revenueByDay = new ArrayList<>();
        revenuePerDay.forEach((day, acc) ->
                revenueByDay.add(new MetricsDto.RevenueByDay(day, acc[0], acc[1])));
        List<MetricsDto.OrdersByDay> ordersByDay = new ArrayList<>();
        ordersPerDay.forEach((day, count) ->
                ordersByDay.add(new MetricsDto.OrdersByDay(day, count)));

        // Top products by quantity across all orders in range (uses item snapshots).
        Map<String, long[]> productAgg = new LinkedHashMap<>(); // title -> [qty, revenueMinor]
        for (Order o : orders) {
            for (OrderItem it : o.getItems()) {
                String title = it.getTitleSnapshot();
                long[] acc = productAgg.computeIfAbsent(title, k -> new long[2]);
                acc[0] += it.getQuantity();
                acc[1] += (long) it.getQuantity() * it.getPriceMinorSnapshot();
            }
        }
        List<MetricsDto.TopProduct> topProducts = productAgg.entrySet().stream()
                .map(e -> new MetricsDto.TopProduct(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .sorted(Comparator.comparingLong(MetricsDto.TopProduct::qty).reversed())
                .limit(TOP_PRODUCTS)
                .toList();

        // Delivery methods (both keys zero-filled).
        Map<String, Long> deliveryMethods = new LinkedHashMap<>();
        for (DeliveryMethod m : DeliveryMethod.values()) {
            deliveryMethods.put(m.name(), 0L);
        }
        for (Order o : orders) {
            if (o.getDeliveryMethod() != null) {
                deliveryMethods.merge(o.getDeliveryMethod().name(), 1L, Long::sum);
            }
        }

        // Payment options by title.
        Map<String, Long> paymentAgg = new LinkedHashMap<>();
        for (Order o : orders) {
            String title = o.getPaymentOptionTitle();
            if (title != null && !title.isBlank()) {
                paymentAgg.merge(title, 1L, Long::sum);
            }
        }
        List<MetricsDto.PaymentOptionCount> paymentOptions = paymentAgg.entrySet().stream()
                .map(e -> new MetricsDto.PaymentOptionCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(MetricsDto.PaymentOptionCount::count).reversed())
                .toList();

        MetricsDto.DeliverySpeed deliverySpeed = deliverySpeed(orders);

        return new MetricsDto(
                range.token(),
                currency,
                totalOrders,
                deliveredOrders,
                byStatus.get(OrderStatus.REJECTED),
                byStatus.get(OrderStatus.APPROVED),
                byStatus.get(OrderStatus.SHIPPED),
                byStatus.get(OrderStatus.NEW),
                revenueMinor,
                avgOrderValueMinor,
                statusCounts,
                revenueByDay,
                ordersByDay,
                topProducts,
                deliveryMethods,
                paymentOptions,
                deliverySpeed);
    }

    /**
     * Real delivery-speed averages from per-transition timestamps (V4). Each metric averages over the
     * orders in range that have BOTH endpoints set; migrated historical orders lack these (NULL) and
     * are naturally excluded. Each average is in hours, rounded to 2 decimals, or null when no order
     * qualifies.
     * <ul>
     *   <li>avgApproveHours = avg(approvedAt - createdAt)</li>
     *   <li>avgShipHours    = avg(shippedAt - approvedAt)</li>
     *   <li>avgDeliverHours = avg(deliveredAt - shippedAt)</li>
     *   <li>avgTotalHours   = avg(deliveredAt - createdAt)</li>
     * </ul>
     */
    private MetricsDto.DeliverySpeed deliverySpeed(List<Order> orders) {
        return new MetricsDto.DeliverySpeed(
                avgHours(orders, Order::getCreatedAt, Order::getApprovedAt),
                avgHours(orders, Order::getApprovedAt, Order::getShippedAt),
                avgHours(orders, Order::getShippedAt, Order::getDeliveredAt),
                avgHours(orders, Order::getCreatedAt, Order::getDeliveredAt));
    }

    /** Average span in hours between two timestamps over orders where both are non-null; null if none. */
    private static Double avgHours(List<Order> orders,
                                   Function<Order, Instant> start,
                                   Function<Order, Instant> end) {
        double sum = 0;
        long count = 0;
        for (Order o : orders) {
            Instant s = start.apply(o);
            Instant e = end.apply(o);
            if (s != null && e != null) {
                double hours = ChronoUnit.MINUTES.between(s, e) / 60.0;
                if (hours >= 0) {
                    sum += hours;
                    count++;
                }
            }
        }
        return count == 0 ? null : round2(sum / count);
    }

    private static String dayOf(Instant instant) {
        if (instant == null) {
            return "unknown";
        }
        return LocalDate.ofInstant(instant, ZoneOffset.UTC).format(DAY);
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
