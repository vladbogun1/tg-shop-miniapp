package com.maxsolch.shop.inbox.domain;

import java.time.Instant;

/**
 * Unread customer messages of one order.
 *
 * @param lastMessageId id of the newest unread message — the event version: a new message
 *                      resurfaces a snoozed chat
 * @param firstUnreadAt the oldest unread message — how long the customer has been waiting
 * @param preview       short text of the newest unread message
 */
public record InboxChatRow(String orderId, long unread, long lastMessageId, Instant firstUnreadAt, String preview) {
}
