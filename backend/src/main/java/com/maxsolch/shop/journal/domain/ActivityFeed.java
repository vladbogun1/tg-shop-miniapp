package com.maxsolch.shop.journal.domain;

import java.time.Instant;

/** The journal feed as the admin reads it: the filter of a request and one row of the answer. */
public final class ActivityFeed {

    private ActivityFeed() {
    }

    /** Filters of the feed; null = any. */
    public record Filter(String source, String type, String result, String recipient, Long tgUserId,
                         String order, String group, String errorCode, String q, Instant from, Instant to) {
    }

    /** One row of the feed. */
    public record Row(long id, Instant createdAt, String source, String type, String result, String recipient,
                      Long tgUserId, String customerName, String customerUsername, Long chatId, String orderId,
                      String groupId, String summary, String errorCode, String error, String details) {
    }
}
