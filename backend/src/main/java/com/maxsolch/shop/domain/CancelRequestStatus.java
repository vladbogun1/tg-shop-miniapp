package com.maxsolch.shop.domain;

/**
 * State of a customer's request to cancel a paid order ({@code orders.cancel_request_status}).
 * One request per order: after {@link #DECLINED} the customer cannot file another one (they write
 * to the order chat instead).
 */
public enum CancelRequestStatus {
    /** Filed by the customer, waits for an admin. */
    PENDING,
    /** Admin approved: the order was rejected (CHANGED_MIND), restocked and refunded. */
    APPROVED,
    /** Admin declined with a comment shown to the customer. */
    DECLINED
}
