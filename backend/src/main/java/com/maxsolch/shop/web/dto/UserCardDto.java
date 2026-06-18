package com.maxsolch.shop.web.dto;

import java.time.Instant;

/** A row in the admin "Users" table. */
public record UserCardDto(
        long telegramUserId,
        String username,
        String firstName,
        String lastName,
        String languageCode,
        boolean premium,
        boolean botBlocked,
        long ordersCount,
        long totalSpentMinor,
        Instant createdAt,
        Instant lastSeenAt) {
}
