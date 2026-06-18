package com.maxsolch.shop.web.dto;

import java.util.List;
import java.util.Map;

/**
 * Admin analytics payload for {@code GET /api/admin/metrics}. All money values are integer minor
 * units. Day buckets are keyed by UTC {@code yyyy-MM-dd}.
 */
public record MetricsDto(
        String range,
        String currency,
        long totalOrders,
        long deliveredOrders,
        long rejectedOrders,
        long approvedOrders,
        long shippedOrders,
        long newOrders,
        long revenueMinor,
        long avgOrderValueMinor,
        Map<String, Long> statusCounts,
        List<RevenueByDay> revenueByDay,
        List<OrdersByDay> ordersByDay,
        List<TopProduct> topProducts,
        Map<String, Long> deliveryMethods,
        List<PaymentOptionCount> paymentOptions,
        DeliverySpeed deliverySpeed) {

    public record RevenueByDay(String date, long revenueMinor, long orders) {
    }

    public record OrdersByDay(String date, long count) {
    }

    public record TopProduct(String title, long qty, long revenueMinor) {
    }

    public record PaymentOptionCount(String title, long count) {
    }

    public record DeliverySpeed(
            Double avgApproveHours,
            Double avgShipHours,
            Double avgDeliverHours,
            Double avgTotalHours) {
    }
}
