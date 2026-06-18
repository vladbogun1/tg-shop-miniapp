package com.maxsolch.shop.web.dto;

public record SendMessageRequest(
        String text,
        String type,
        String attachmentUrl,
        String fileName,
        String mimeType,
        Long replyToMessageId) {
}
