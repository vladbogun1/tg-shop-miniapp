package com.maxsolch.shop.order.app;

import org.springframework.lang.Nullable;

import java.time.Instant;

public record MessageDto(
        Long id,
        String orderId,
        String senderType,
        @Nullable String senderName,
        String type,
        @Nullable String text,
        @Nullable String attachmentUrl,
        @Nullable String fileName,
        @Nullable String mimeType,
        @Nullable Long replyToMessageId,
        Instant createdAt,
        @Nullable Instant readAt) {
}
