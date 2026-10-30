package com.maxsolch.shop.notification.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code notification} module's errors; the text of each is {@code error.notification.<NAME>} in the i18n bundles. */
public enum NotificationError implements ErrorCode {

    PUSH_BAD_KEYS("PUSH_BAD_KEYS"),
    PUSH_NOT_SUBSCRIBED("PUSH_NOT_SUBSCRIBED"),
    PUSH_DISABLED("PUSH_DISABLED"),
    PUSH_BAD_ENDPOINT("PUSH_BAD_ENDPOINT"),
    PUSH_BAD_ENDPOINT_UNKNOWN_SERVICE("PUSH_BAD_ENDPOINT"),
    BOT_NOT_CONFIGURED,
    BROADCAST_RUNNING;

    private final String code;

    NotificationError() {
        this(null);
    }

    NotificationError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
