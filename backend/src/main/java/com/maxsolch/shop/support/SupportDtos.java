package com.maxsolch.shop.support;

import java.time.Instant;

/** Wire shapes of {@code /api/me/support/**}, {@code /api/admin/support/**} and the STOMP topic. */
public final class SupportDtos {

    private SupportDtos() {
    }

    /**
     * One thread. {@code unreadCount} is what the viewer has not read: shop messages for the
     * customer, customer messages for an admin. {@code awaitingSince} != null means the customer
     * waits for an answer.
     */
    public record ThreadDto(
            String id,
            String status,
            String subject,
            String productId,
            String productTitle,
            String productSlug,
            String productImageUrl,
            String source,
            Instant lastMessageAt,
            String lastSender,
            String lastPreview,
            int unreadCount,
            Instant awaitingSince,
            Instant createdAt,
            Instant closedAt,
            String closedBy,
            Long userId,
            String customerName) {
    }

    /** A message — same fields as the order-chat {@code MessageDto}, with {@code threadId}. */
    public record MessageDto(
            Long id,
            String threadId,
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

    /**
     * {@code POST /api/me/support/threads}: the first message, optionally about a product. If the
     * customer already has an open thread about that product, the message goes there instead.
     */
    public record CreateThreadRequest(
            String productId,
            String subject,
            String text,
            String type,
            String attachmentUrl,
            String fileName,
            String mimeType) {
    }

    /** What the apps need to show (or hide) support and pre-check a message. */
    public record ConfigDto(boolean enabled, int maxLength, int cooldownSec, int maxOpenThreads,
                            int maxMessagesPerHour) {
    }

    public record CountDto(long count) {
    }
}
