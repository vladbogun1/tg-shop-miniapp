package com.maxsolch.shop.journal.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import org.springframework.lang.Nullable;

/** The journal feed as the admin reads it: the filter of a request and one row of the answer. */
public final class ActivityFeed {

    private ActivityFeed() {
    }

    /** Filters of the feed; null = any. */
    public record Filter(String source, String type, String result, String recipient, Long tgUserId,
                         String order, String group, String errorCode, String q, Instant from, Instant to) {
    }

    /** One row of the feed. */
    public record Row(long id, Instant createdAt,
                      @Schema(allowableValues = {"BOT", "SITE", "MINIAPP", "PAYMENT", "SYSTEM"}) String source,
                      String type,
                      @Schema(allowableValues = {"OK", "FAILED", "SKIPPED"}) String result,
                      /** CUSTOMER | ADMINS — whom the bot wrote to; null for non-messages. */
                      @Nullable String recipient,
                      @Nullable Long tgUserId, @Nullable String customerName, @Nullable String customerUsername,
                      @Nullable Long chatId, @Nullable String orderId, @Nullable String groupId, @Nullable String summary,
                      @Nullable String errorCode, @Nullable String error,
                      /** JSON object as text. */
                      @Nullable String details) {
    }
}
