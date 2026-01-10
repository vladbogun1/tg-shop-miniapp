package com.example.tgshop.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record OrderDto(
    UUID id,
    long totalMinor,
    String currency,
    String customerName,
    String phone,
    String address,
    String comment,
    long tgUserId,
    String tgUsername,
    String status,
    Instant createdAt,
    List<OrderItemDto> items
) {}
