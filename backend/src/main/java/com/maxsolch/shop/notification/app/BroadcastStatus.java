package com.maxsolch.shop.notification.app;

import java.time.Instant;

/**
 * Live progress of the (single) running or last-finished broadcast.
 * {@code stopRequested}: «Остановить» pressed, the sender is finishing the current batch;
 * {@code stopped}: it ended that way (the rest was not sent), {@code stoppedBy} is the admin.
 */
public record BroadcastStatus(
        boolean running,
        int total,
        int sent,
        int failed,
        int blocked,
        Instant startedAt,
        Instant finishedAt,
        boolean stopRequested,
        boolean stopped,
        String stoppedBy) {

    public BroadcastStatus(boolean running, int total, int sent, int failed, int blocked,
                           Instant startedAt, Instant finishedAt) {
        this(running, total, sent, failed, blocked, startedAt, finishedAt, false, false, null);
    }

    public static BroadcastStatus idle() {
        return new BroadcastStatus(false, 0, 0, 0, 0, null, null);
    }
}
