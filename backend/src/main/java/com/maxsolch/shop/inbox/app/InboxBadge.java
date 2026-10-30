package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.support.app.AdminBadge;
import org.springframework.stereotype.Component;

/** The «Внимание» total as the admin app icon badge (asked for by the support push). */
@Component
class InboxBadge implements AdminBadge {

    private final InboxService inbox;

    InboxBadge(InboxService inbox) {
        this.inbox = inbox;
    }

    @Override
    public int total() {
        return inbox.inbox().total();
    }
}
