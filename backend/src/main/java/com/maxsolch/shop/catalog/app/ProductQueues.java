package com.maxsolch.shop.catalog.app;

import java.util.Map;

/** What the catalog needs to know about pre-order queues; implemented by the preorder module. */
public interface ProductQueues {

    /** A product leaves sale: its queues are closed. */
    void closeFor(byte[] productId);

    /** Product id to {people, units} waiting for it. */
    Map<String, int[]> waitingByProduct();
}
