package com.maxsolch.shop.support.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code support} module's errors; the text of each is {@code error.support.<NAME>} in the i18n bundles. */
public enum SupportError implements ErrorCode {

    TEMPLATE_NOT_FOUND,
    ORDER_NOT_FOUND,
    ORDER_NOT_FOUND_EN,
    SUPPORT_DISABLED("SUPPORT_DISABLED"),
    SUPPORT_TOO_LONG("SUPPORT_TOO_LONG"),
    BAD_ATTACHMENT,
    NEEDS_CONTENT,
    SUPPORT_COOLDOWN("SUPPORT_COOLDOWN"),
    SUPPORT_HOURLY_LIMIT("SUPPORT_HOURLY_LIMIT"),
    SUPPORT_TOO_MANY_THREADS("SUPPORT_TOO_MANY_THREADS"),
    THREAD_NOT_FOUND,
    NOT_YOUR_THREAD,
    PRODUCT_NOT_FOUND,
    UNKNOWN_MESSAGE_TYPE;

    private final String code;

    SupportError() {
        this(null);
    }

    SupportError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
