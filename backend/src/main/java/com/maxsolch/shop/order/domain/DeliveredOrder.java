package com.maxsolch.shop.order.domain;

import java.time.Instant;
import java.util.List;

/** A delivered order with a Telegram chat, with the ids of its paid lines that are not fully returned. */
public record DeliveredOrder(byte[] orderId, Long tgUserId, Instant deliveredAt, List<Long> itemIds) {
}
