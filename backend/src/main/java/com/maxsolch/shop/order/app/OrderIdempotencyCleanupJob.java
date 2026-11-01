package com.maxsolch.shop.order.app;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/** Hourly: checkout idempotency keys older than a day. */
@Slf4j
@Component
public class OrderIdempotencyCleanupJob {

    static final Duration KEEP = Duration.ofDays(1);

    private final OrderIdempotencyService idempotency;
    private final Clock clock;

    public OrderIdempotencyCleanupJob(OrderIdempotencyService idempotency, Clock clock) {
        this.idempotency = idempotency;
        this.clock = clock;
    }

    @SchedulerLock(name = "OrderIdempotencyCleanupJob.cleanup", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.order.idempotency-cleanup-cron:0 17 * * * *}")
    public void cleanup() {
        try {
            int removed = idempotency.deleteOlderThan(clock.instant().minus(KEEP));
            if (removed > 0) {
                log.info("Order idempotency cleanup: {} keys removed", removed);
            }
        } catch (RuntimeException e) {
            log.warn("Order idempotency cleanup failed: {}", e.toString());
        }
    }
}
