package com.example.tgshop.api.dto;

import java.util.UUID;

public record OrderItemDto(
    UUID productId,
    String titleSnapshot,
    long priceMinorSnapshot,
    int quantity
) {}
