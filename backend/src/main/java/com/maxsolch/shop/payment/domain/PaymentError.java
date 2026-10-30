package com.maxsolch.shop.payment.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code payment} module's errors; the text of each is {@code error.payment.<NAME>} in the i18n bundles. */
public enum PaymentError implements ErrorCode {

    RETURN_TO_INVALID,
    LINK_EXPIRED,
    FILE_NOT_FOUND,
    ORDER_NOT_FOUND,
    PAYMENT_UNAVAILABLE("PAYMENT_UNAVAILABLE"),
    ORDER_NOT_FOUND_CUSTOMER,
    PAYMENT_EXPIRED("PAYMENT_EXPIRED"),
    NOT_PAYABLE("NOT_PAYABLE"),
    PAYMENT_IN_PROGRESS("PAYMENT_IN_PROGRESS"),
    PAYMENT_FAILED("PAYMENT_FAILED"),
    INVOICE_NOT_FOUND,
    INVOICE_NOT_PAID,
    REFUND_AMOUNT_OUT_OF_RANGE,
    ALREADY_REFUNDED,
    MONO_REFUND_REJECTED,
    MONO_REFUND_PENDING,
    MONO_NOTHING_TO_REFUND,
    MONO_REFUND_LIMIT,
    ALL_METHODS_DISABLED,
    METHOD_FIELD_INVALID,
    METHOD_TITLE_REQUIRED,
    PREPAYMENT_NEGATIVE;

    private final String code;

    PaymentError() {
        this(null);
    }

    PaymentError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
