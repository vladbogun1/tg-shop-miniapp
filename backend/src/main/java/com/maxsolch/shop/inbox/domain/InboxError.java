package com.maxsolch.shop.inbox.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code inbox} module's errors; the text of each is {@code error.inbox.<NAME>} in the i18n bundles. */
public enum InboxError implements ErrorCode {

    EMPTY_REQUEST,
    INBOX_BAD_PRESET("INBOX_BAD_PRESET"),
    INBOX_NOT_DISMISSIBLE("INBOX_NOT_DISMISSIBLE"),
    INBOX_BAD_TYPE("INBOX_BAD_TYPE"),
    INBOX_BAD_ENTITY("INBOX_BAD_ENTITY"),
    INBOX_BAD_VERSION("INBOX_BAD_VERSION");

    private final String code;

    InboxError() {
        this(null);
    }

    InboxError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
