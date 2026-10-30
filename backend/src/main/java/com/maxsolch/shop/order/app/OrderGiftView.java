package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.app.OrderGiftDtos.OrderGiftDto;
import com.maxsolch.shop.order.domain.Order;

/** The gift block of the order page (docs/GIFT-CASE.md); the gift module fills it, the order page only shows it. */
public interface OrderGiftView {

    /**
     * @param customer the prize stays hidden until the case is opened
     * @return null when the order has no gift
     */
    OrderGiftDto orderGift(Order order, String lang, boolean customer);
}
