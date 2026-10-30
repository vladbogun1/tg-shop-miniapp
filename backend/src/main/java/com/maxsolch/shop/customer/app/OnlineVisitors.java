package com.maxsolch.shop.customer.app;

/**
 * Who is on the site right now, from the client events journal. Declared by customer (the users map shows it), implemented
 * by {@code analytics}, the owner of {@code client_events}.
 */
public interface OnlineVisitors {

    /** Distinct visitors with an event in the last {@code windowMinutes}: Mini App, site (WEB channel) and everyone once. */
    record Counts(long miniapp, long web, long total) {
    }

    Counts within(int windowMinutes);
}
