package com.maxsolch.shop.notification.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Machine-readable reasons of the admin push endpoints; the admin app branches on them, never rename. */
public enum PushError implements ErrorCode {
    PUSH_BAD_KEYS, PUSH_NOT_SUBSCRIBED, PUSH_DISABLED, PUSH_BAD_ENDPOINT;

    @Override
    public String code() {
        return name();
    }
}
