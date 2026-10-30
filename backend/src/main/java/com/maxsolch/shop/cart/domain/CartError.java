package com.maxsolch.shop.cart.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code cart} module's errors; the text of each is {@code error.cart.<NAME>} in the i18n bundles. */
public enum CartError implements ErrorCode {

    TOO_MANY_LINES,
    CART_TOO_LARGE;

    private final String code;

    CartError() {
        this(null);
    }

    CartError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
