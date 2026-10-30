package com.maxsolch.shop.preorder.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code preorder} module's errors; the text of each is {@code error.preorder.<NAME>} in the i18n bundles. */
public enum PreorderError implements ErrorCode {

    BAD_PERIOD("BAD_PERIOD"),
    BAD_PERIOD_RANGE("BAD_PERIOD"),
    QUEUE_ENTRY_NOT_FOUND,
    PRODUCT_NOT_FOUND,
    VARIANT_GONE("VARIANT_GONE"),
    WAITING_NOT_FOUND,
    PRODUCT_UNAVAILABLE,
    QUANTITY_OUT_OF_RANGE,
    IN_STOCK("IN_STOCK"),
    TOO_MANY("TOO_MANY"),
    VARIANT_REQUIRED,
    PRODUCT_ID_REQUIRED,
    INVALID_ID;

    private final String code;

    PreorderError() {
        this(null);
    }

    PreorderError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
