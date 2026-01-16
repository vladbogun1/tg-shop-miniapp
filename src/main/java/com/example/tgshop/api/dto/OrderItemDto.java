package com.example.tgshop.api.dto;

import java.util.UUID;

public record OrderItemDto(
    UUID productId,
    UUID variantId,
    String titleSnapshot,
    String variantNameSnapshot,
    long priceMinorSnapshot,
    int quantity
) {}
