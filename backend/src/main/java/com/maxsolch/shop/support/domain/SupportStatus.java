package com.maxsolch.shop.support.domain;

/** Lifecycle of a support thread: open until an admin, the customer or the auto-close job closes it. */
public enum SupportStatus {
    OPEN,
    CLOSED
}
