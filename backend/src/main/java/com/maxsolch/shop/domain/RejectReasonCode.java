package com.maxsolch.shop.domain;

import java.util.Locale;

/**
 * Why an order was rejected — a fixed list so the reasons can be counted (the free-text
 * {@code reject_reason} stays as an optional explanation). Stored as its name in
 * {@code orders.reject_reason_code}; null there means "not specified" (historical orders).
 */
public enum RejectReasonCode {
    /** The customer does not answer. */
    NO_RESPONSE,
    /** The customer changed their mind / cancelled. */
    CHANGED_MIND,
    OUT_OF_STOCK,
    DUPLICATE,
    /** The prepayment never arrived. */
    NOT_PAID,
    /** Not paid online within the payment deadline — rejected automatically. */
    PAYMENT_TIMEOUT,
    /** The parcel was refused at Nova Poshta. */
    REFUSED_AT_POST,
    /** The goods came back after delivery. */
    RETURNED,
    OTHER;

    /** Parses a code from the API; null/blank → null, anything unknown → IllegalArgumentException. */
    public static RejectReasonCode parseOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return RejectReasonCode.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
