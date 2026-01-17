package com.example.tgshop.api.dto;

import java.time.Instant;
import java.util.UUID;

public record PromoCodeDto(
    UUID id,
    String code,
    int discountPercent,
    long discountAmountMinor,
    Integer maxUses,
    int usesCount,
    boolean active,
    Instant createdAt
) {}
