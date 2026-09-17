package com.maxsolch.shop.service;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.dto.MetricsDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
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
 * Admin analytics over a {@link TimeRange}.
 *
 * <p>Reads a flat {@link MetricsRow} projection (one query, no entities, no lazy item loading) and
 * gets the best-seller breakdown from a grouped query. Day buckets are cut in the shop's business
 * timezone: doing it in UTC pushed every late-evening order in Ukraine into the next day's column.
 */
@Slf4j
@Service
public class MetricsService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String DEFAULT_CURRENCY = "UAH";
    private static final int TOP_PRODUCTS = 10;

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ZoneId zone;

    public MetricsService(OrderRepository orderRepository,
                          OrderItemRepository orderItemRepository,
                          AppProperties props) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.zone = resolveZone(props.getTimezone());
    }

    private static ZoneId resolveZone(String configured) {
        if (configured == null || configured.isBlank()) {
            return ZoneId.of("Europe/Kyiv");
        }
        try {
            return ZoneId.of(configured.trim());
        } catch (Exception e) {
            log.warn("Unknown app.timezone '{}', falling back to Europe/Kyiv", configured);
            return ZoneId.of("Europe/Kyiv");
        }
    }

    @Transactional(readOnly = true)
    public MetricsDto compute(TimeRange range) {
        Instant from = range.from();
        List<MetricsRow> orders = orderRepository.findMetricsRows(from);

        String currency = orders.stream()
                .map(MetricsRow::currency)
                .filter(c -> c != null && !c.isBlank())
                .findFirst()
                .orElse(DEFAULT_CURRENCY);

        // Status counts (all five, zero-filled).
        Map<OrderStatus, Long> byStatus = new EnumMap<>(OrderStatus.class);
        for (OrderStatus s : OrderStatus.values()) {
            byStatus.put(s, 0L);
        }
        for (MetricsRow o : orders) {
            byStatus.merge(o.status(), 1L, Long::sum);
        }
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (OrderStatus s : OrderStatus.values()) {
            statusCounts.put(s.name(), byStatus.get(s));
        }

        long totalOrders = orders.size();
        long deliveredOrders = byStatus.get(OrderStatus.DELIVERED);

        // Revenue = sum of total_minor for DELIVERED orders in range.
        long revenueMinor = orders.stream()
                .filter(o -> o.status() == OrderStatus.DELIVERED)
                .mapToLong(MetricsRow::totalMinor)
                .sum();
        long avgOrderValueMinor = deliveredOrders == 0 ? 0 : revenueMinor / deliveredOrders;

        // Per-day buckets in the business timezone. TreeMap keeps yyyy-MM-dd keys chronological.
        Map<String, long[]> revenuePerDay = new TreeMap<>(); // [revenueMinor, ordersCount]
        Map<String, Long> ordersPerDay = new TreeMap<>();
        for (MetricsRow o : orders) {
            String day = dayOf(o.createdAt());
            ordersPerDay.merge(day, 1L, Long::sum);
            if (o.status() == OrderStatus.DELIVERED) {
                long[] acc = revenuePerDay.computeIfAbsent(day, k -> new long[2]);
                acc[0] += o.totalMinor();
                acc[1] += 1;
            }
        }
        List<MetricsDto.RevenueByDay> revenueByDay = new ArrayList<>();
        revenuePerDay.forEach((day, acc) ->
                revenueByDay.add(new MetricsDto.RevenueByDay(day, acc[0], acc[1])));
        List<MetricsDto.OrdersByDay> ordersByDay = new ArrayList<>();
        ordersPerDay.forEach((day, count) ->
                ordersByDay.add(new MetricsDto.OrdersByDay(day, count)));

        List<MetricsDto.TopProduct> topProducts = topProducts(from);

        // Delivery methods (both keys zero-filled).
        Map<String, Long> deliveryMethods = new LinkedHashMap<>();
        for (DeliveryMethod m : DeliveryMethod.values()) {
            deliveryMethods.put(m.name(), 0L);
        }
        for (MetricsRow o : orders) {
            if (o.deliveryMethod() != null) {
                deliveryMethods.merge(o.deliveryMethod().name(), 1L, Long::sum);
            }
        }

        // Payment options by title.
        Map<String, Long> paymentAgg = new LinkedHashMap<>();
        for (MetricsRow o : orders) {
            String title = o.paymentOptionTitle();
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

    /** Best sellers, grouped and sorted by the database rather than by walking every order. */
    private List<MetricsDto.TopProduct> topProducts(Instant from) {
        return orderItemRepository.topProducts(from, PageRequest.of(0, TOP_PRODUCTS)).stream()
                .map(r -> new MetricsDto.TopProduct(
                        r[0] == null ? "—" : r[0].toString(),
                        ((Number) r[1]).longValue(),
                        ((Number) r[2]).longValue()))
                .toList();
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
    private MetricsDto.DeliverySpeed deliverySpeed(List<MetricsRow> orders) {
        return new MetricsDto.DeliverySpeed(
                avgHours(orders, MetricsRow::createdAt, MetricsRow::approvedAt),
                avgHours(orders, MetricsRow::approvedAt, MetricsRow::shippedAt),
                avgHours(orders, MetricsRow::shippedAt, MetricsRow::deliveredAt),
                avgHours(orders, MetricsRow::createdAt, MetricsRow::deliveredAt));
    }

    /** Average span in hours between two timestamps over orders where both are non-null; null if none. */
    private static Double avgHours(List<MetricsRow> orders,
                                   Function<MetricsRow, Instant> start,
                                   Function<MetricsRow, Instant> end) {
        double sum = 0;
        long count = 0;
        for (MetricsRow o : orders) {
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

    private String dayOf(Instant instant) {
        if (instant == null) {
            return "unknown";
        }
        return LocalDate.ofInstant(instant, zone).format(DAY);
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
