package com.maxsolch.shop.order.app;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

import java.time.Instant;

public record MessageDto(
        Long id,
        String orderId,
        @Schema(implementation = com.maxsolch.shop.order.domain.SenderType.class) String senderType,
        @Nullable String senderName,
        @Schema(implementation = com.maxsolch.shop.order.domain.MessageType.class) String type,
        @Nullable String text,
        @Nullable String attachmentUrl,
        @Nullable String fileName,
        @Nullable String mimeType,
        @Nullable Long replyToMessageId,
        Instant createdAt,
        @Nullable Instant readAt) {
}
