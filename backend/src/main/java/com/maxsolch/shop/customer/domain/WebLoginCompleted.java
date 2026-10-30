package com.maxsolch.shop.customer.domain;

/** Published after a successful website login so the bot can tell the user (and offer "end session"). */
public record WebLoginCompleted(String sessionId, long telegramUserId, String deviceLabel) {
}
