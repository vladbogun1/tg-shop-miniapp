package com.maxsolch.shop.service;

/**
 * Domain events published by {@link OrderService} instead of calling Telegram inline.
 *
 * <p>Notifications used to be sent from the middle of the write transaction, so a slow or
 * rate-limited Telegram API held a database connection (and the row locks taken for stock) open for
 * the whole round trip. These events are consumed after the transaction commits — see
 * {@code OrderNotificationListener} — which also means a customer never gets a message about an
 * order that then failed to save.
 *
 * <p>Ids are carried instead of entities: the listener runs in its own transaction and re-reads a
 * fresh, managed instance, so any message ids the Telegram calls write back are persisted properly.
 */
public final class OrderEvents {

    private OrderEvents() {
    }

    /** A new order was placed: channel card + DM to the customer. */
    public record Created(byte[] orderId) {
    }

    /** Status moved: move the channel card, DM the customer, add/remove the dispatch card. */
    public record StatusChanged(byte[] orderId) {
    }

    /** The customer uploaded a transfer screenshot (claim only — no money recorded). */
    public record PaymentClaimed(byte[] orderId) {
    }

    /** What changed in an order an admin edited, for the customer-facing message. */
    public enum EditKind {
        /** Composition/price changed. */
        COMPOSITION,
        /** A discount was applied. */
        DISCOUNT,
        /** A free gift was added. */
        GIFT,
        /** Nothing to tell the customer — only refresh the seller's dispatch card. */
        SILENT
    }

    /**
     * An admin edited the order.
     *
     * @param notifyCustomer whether the customer should be messaged at all
     */
    public record Edited(byte[] orderId,
                         EditKind kind,
                         boolean notifyCustomer,
                         String productTitle,
                         String variantName,
                         int quantity) {

        public static Edited silent(byte[] orderId) {
            return new Edited(orderId, EditKind.SILENT, false, null, null, 0);
        }

        public static Edited of(byte[] orderId, EditKind kind, boolean notifyCustomer) {
            return new Edited(orderId, kind, notifyCustomer, null, null, 0);
        }
    }

    /** A chat message was posted. Admin messages DM the customer; customer messages ping admins. */
    public record ChatMessage(byte[] orderId, boolean fromAdmin, String preview) {
    }
}
