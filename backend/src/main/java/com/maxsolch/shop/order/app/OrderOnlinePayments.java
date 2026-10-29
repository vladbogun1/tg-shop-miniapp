package com.maxsolch.shop.order.app;

import java.util.List;

/**
 * What the order module needs from online payments (monobank invoices). The order module declares it and the
 * {@code payment} module implements it, so the dependency points one way (payment to order) and the order never
 * imports payment. Every method that calls the bank is for use OUTSIDE a database transaction.
 */
public interface OrderOnlinePayments {

    /** Latest invoice of the order as the customer apps show it ("none" status when there is no invoice). */
    OnlinePaymentDto summary(byte[] orderId, long amountDueMinor);

    /** What the bank can still be asked to give back: the unreturned part of every paid invoice. */
    long refundableMinor(byte[] orderId);

    /** Is there a payment the bank is still processing (do not cancel or archive the order under it)? */
    boolean hasPaymentInFlight(byte[] orderId);

    /** Polls every invoice of the order whose status may still change. */
    void refresh(byte[] orderId);

    /** Closes the payment pages of an order that will not be paid any more. */
    void closeOpenInvoices(byte[] orderId);

    /**
     * Full refund of every paid invoice of the order. A refund the bank refuses is reported in
     * {@link RefundAll#errors()} and does not stop the others.
     */
    RefundAll refundAll(byte[] orderId);

    /** Id of an invoice that can give back {@code amountMinor} in one refund; 400 naming what is refundable when none can. */
    String refundableInvoice(byte[] orderId, long amountMinor);

    /** Asks the bank to refund {@code amountMinor} (null = all that is left) of the invoice. */
    void refund(byte[] orderId, String invoiceId, Long amountMinor);

    /**
     * Outcome of {@link #refundAll}.
     *
     * @param onlineReceivedMinor what came in through the paid invoices
     * @param requestedMinor      what was asked back from the bank
     */
    record RefundAll(long onlineReceivedMinor, long requestedMinor, int refundedInvoices, List<String> errors) {
    }
}
