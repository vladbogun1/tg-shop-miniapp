package com.maxsolch.shop.web.dto;

import java.time.Instant;

/** Live progress of the (single) running or last-finished broadcast. */
public record BroadcastStatus(
        boolean running,
        int total,
        int sent,
        int failed,
        int blocked,
        Instant startedAt,
        Instant finishedAt) {

    public static BroadcastStatus idle() {
        return new BroadcastStatus(false, 0, 0, 0, 0, null, null);
    }
}
