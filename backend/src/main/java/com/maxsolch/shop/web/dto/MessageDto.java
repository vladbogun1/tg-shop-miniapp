package com.maxsolch.shop.web.dto;

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
