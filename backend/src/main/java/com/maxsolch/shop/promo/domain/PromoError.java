package com.maxsolch.shop.promo.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code promo} module's errors; the text of each is {@code error.promo.<NAME>} in the i18n bundles. */
public enum PromoError implements ErrorCode {

    INVALID_ORIGIN,
    PROMO_NOT_FOUND,
    CODE_TAKEN,
    CODE_ALREADY_USED_RENAME,
    PROMO_USED("PROMO_USED"),
    DISCOUNT_REQUIRED,
    INVALID_ID;

    private final String code;

    PromoError() {
        this(null);
    }

    PromoError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
