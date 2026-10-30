package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.util.UuidUtil;

/** How an order is named in Telegram texts and logs. */
final class OrderTg {

    private OrderTg() {
    }

    static String idStr(Order order) {
        return UuidUtil.toString(order.getId());
    }

    /** The first 8 characters of the id, as customers and the seller see it («#1a2b3c4d»). */
    static String shortId(Order order) {
        String id = idStr(order);
        return id == null ? "?" : id.substring(0, 8);
    }
}
