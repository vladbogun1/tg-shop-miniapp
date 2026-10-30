package com.maxsolch.shop.order.domain;

/** Who places an order and how to reach them: the Telegram / site account, the recipient's name and phone, a note. */
public record OrderBuyer(Long userId, Long tgUserId, String tgUsername, String customerName, String phone,
                         String comment) {
}
