package com.maxsolch.shop.customer.domain;

import java.time.Instant;
import org.springframework.lang.Nullable;

/** A row in the admin "Users" table. */
public record UserCardDto(
        long telegramUserId,
        @Nullable String username,
        @Nullable String firstName,
        @Nullable String lastName,
        @Nullable String languageCode,
        boolean premium,
        boolean botBlocked,
        long ordersCount,
        long totalSpentMinor,
        @Nullable Instant createdAt,
        @Nullable Instant lastSeenAt,
        /** uk | ru | en chosen in the shop (users.locale, V17); null = never chose. */
        @Nullable String locale,
        /** When the customer's latest order (any status) was placed; null = never ordered. */
        @Nullable Instant lastOrderAt,
        /** «Проблемный покупатель»: the reason the admin gave; null = not marked. */
        @Nullable String problemReason) {
}
