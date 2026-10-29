package com.maxsolch.shop.order.app;

import java.time.Instant;

public record MessageDto(
        Long id,
        String orderId,
        String senderType,
        String senderName,
        String type,
        String text,
        String attachmentUrl,
        String fileName,
        String mimeType,
        Long replyToMessageId,
        Instant createdAt,
        Instant readAt) {
}
