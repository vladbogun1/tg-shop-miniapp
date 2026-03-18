package com.example.tgshop.api.dto;

import java.util.List;

public record AdminOrdersPageDto(
    List<OrderDto> items,
    long totalCount,
    int page,
    int size,
    int totalPages,
    long deliveredRevenueMinor,
    long deliveredCount,
    String currency
) {}
