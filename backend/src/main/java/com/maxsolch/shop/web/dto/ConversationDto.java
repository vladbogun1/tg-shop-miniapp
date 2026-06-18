package com.maxsolch.shop.web.dto;

import java.time.Instant;

/** A chat conversation row for the notifications inbox modal. */
public record ConversationDto(
        String orderId,
        String shortId,
        String customerName,
        String status,
        String lastPreview,
        String lastSenderType,
        Instant lastAt,
        long unreadCount) {
}
