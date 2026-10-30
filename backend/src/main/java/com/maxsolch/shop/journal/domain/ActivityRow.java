package com.maxsolch.shop.journal.domain;

import java.time.Instant;
import java.util.Map;

/** One finished journal row, as the store writes it. Built from an {@code ActivityLog.Entry}. */
public record ActivityRow(Instant at, String source, String type, String result, String recipient, Long tgUserId,
                          Long chatId, byte[] orderId, String groupId, String summary, String errorCode,
                          String error, Map<String, Object> details) {

    public static final String OK = "OK";
    public static final String TO_ADMINS = "ADMINS";
}
