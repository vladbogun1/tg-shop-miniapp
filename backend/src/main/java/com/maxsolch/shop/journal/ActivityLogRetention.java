package com.maxsolch.shop.journal;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Nightly clean-up of the «Бот и сайт» journal: rows older than {@code app.journal.retention-days}
 * (90 by default) are deleted. A broadcast to everyone writes a row per customer, so without this
 * the table would only ever grow.
 */
@Slf4j
@Component
public class ActivityLogRetention {

    private final ActivityLogStore store;
    private final int retentionDays;

    public ActivityLogRetention(ActivityLogStore store,
                                @Value("${app.journal.retention-days:90}") int retentionDays) {
        this.store = store;
        this.retentionDays = Math.max(7, retentionDays);
    }

    public int retentionDays() {
        return retentionDays;
    }

    @Scheduled(cron = "${app.journal.purge-cron:0 35 4 * * *}")
    public void purge() {
        try {
            int n = store.purgeBefore(Instant.now().minus(Duration.ofDays(retentionDays)));
            if (n > 0) {
                log.info("Activity log: {} rows older than {} days removed", n, retentionDays);
            }
        } catch (Exception e) {
            log.warn("Activity log purge failed: {}", e.getMessage());
        }
    }
}
