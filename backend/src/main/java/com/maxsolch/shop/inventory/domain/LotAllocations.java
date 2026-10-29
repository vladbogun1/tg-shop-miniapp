package com.maxsolch.shop.inventory.domain;

import java.time.Instant;
import java.util.List;

/**
 * Where the units of a sale remember which stock lots they came from. Inventory moves units between the shelf
 * and the lots; whoever sold the units (an order line) keeps the record and implements this, so inventory
 * does not need to know what an order is.
 */
public interface LotAllocations {

    /** {@code qty} units taken from lot {@code lotId}. */
    record Share(long lotId, int qty) {
    }

    /** What was taken, oldest first (a copy: change it only through {@link #add} and {@link #reduceAt}). */
    List<Share> shares();

    /** Units taken from a lot just now; they join the last share when it is the same lot. */
    void add(long lotId, int qty, Instant at);

    /** Gives {@code qty} units of the share at {@code index} back; an empty share disappears. */
    void reduceAt(int index, int qty);
}
