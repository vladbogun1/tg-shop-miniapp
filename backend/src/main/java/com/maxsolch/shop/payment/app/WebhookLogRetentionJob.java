package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.infra.WebhookLogStore;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/** Nightly: raw monobank webhooks older than {@value #RETENTION_DAYS} days are of no use for disputes any more. */
@Slf4j
@Component
public class WebhookLogRetentionJob {

    static final int RETENTION_DAYS = 90;

    private final WebhookLogStore store;
    private final Clock clock;

    public WebhookLogRetentionJob(WebhookLogStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @SchedulerLock(name = "WebhookLogRetentionJob.purge", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "0 50 4 * * *")
    public void purge() {
        try {
            int n = store.purgeBefore(clock.instant().minus(Duration.ofDays(RETENTION_DAYS)));
            if (n > 0) {
                log.info("Webhook log: {} rows older than {} days removed", n, RETENTION_DAYS);
            }
        } catch (Exception e) {
            log.warn("Webhook log purge failed: {}", e.getMessage());
        }
    }
}
