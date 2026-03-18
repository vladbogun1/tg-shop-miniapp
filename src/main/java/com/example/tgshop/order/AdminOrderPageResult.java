package com.example.tgshop.order;

import java.util.List;

public record AdminOrderPageResult(
    List<OrderEntity> orders,
    long totalCount,
    long deliveredRevenueMinor,
    long deliveredCount,
    String currency
) {}
