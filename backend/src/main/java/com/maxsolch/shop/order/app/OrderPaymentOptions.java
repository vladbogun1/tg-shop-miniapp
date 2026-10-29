package com.maxsolch.shop.order.app;

import java.util.Optional;

/**
 * The payment options on offer at checkout, as the order needs them for its snapshot. Declared by the order module,
 * implemented by {@code payment} (which owns the options).
 */
public interface OrderPaymentOptions {

    /** An option that is still on offer; empty for an unknown or switched-off one. */
    Optional<Option> findActive(byte[] id);

    /** The first active option in checkout order. */
    Optional<Option> firstActive();

    record Option(byte[] id, String title, boolean requiresPrepayment, long prepaymentMinor) {
    }
}
