package com.maxsolch.shop.order.app;

import org.springframework.lang.Nullable;

import java.time.Instant;

/** A chat conversation row for the notifications inbox modal. */
public record ConversationDto(
        String orderId,
        String shortId,
        @Nullable String customerName,
        String status,
        @Nullable String lastPreview,
        @Nullable String lastSenderType,
        @Nullable Instant lastAt,
        long unreadCount) {
}
