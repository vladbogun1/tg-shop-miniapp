package com.maxsolch.shop.platform.journal;

import java.util.Optional;

/** The journal asks the owner of orders whose order it is (an entry about an order carries the customer). */
public interface JournalOrders {

    /** The Telegram id of the customer of the order, empty when there is no such order or it has no customer. */
    Optional<Long> customerOf(byte[] orderId);
}
