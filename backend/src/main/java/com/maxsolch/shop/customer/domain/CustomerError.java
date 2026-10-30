package com.maxsolch.shop.customer.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code customer} module's errors; the text of each is {@code error.customer.<NAME>} in the i18n bundles. */
public enum CustomerError implements ErrorCode {

    NO_REFRESH_TOKEN,
    ORIGIN_NOT_ALLOWED,
    LOGIN_NOT_FOUND,
    LOGIN_OTHER_BROWSER,
    LOGIN_BAD_STATE,
    SESSION_NOT_FOUND,
    SESSION_ENDED,
    REFRESH_TOKEN_ROTATED,
    REFRESH_TOKEN_REUSED,
    INVALID_ID;

    private final String code;

    CustomerError() {
        this(null);
    }

    CustomerError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
