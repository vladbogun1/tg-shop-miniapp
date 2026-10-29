package com.maxsolch.shop.order.api;

public record SendMessageRequest(
        String text,
        String type,
        String attachmentUrl,
        String fileName,
        String mimeType,
        Long replyToMessageId) {
}
