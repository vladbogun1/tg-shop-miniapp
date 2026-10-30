package com.maxsolch.shop.journal.app;

import com.maxsolch.shop.journal.infra.ActivityLogStore;
import java.time.Clock;
import lombok.extern.slf4j.Slf4j;
import com.maxsolch.shop.platform.config.AppProperties;
import org.springframework.beans.factory.annotation.Autowired;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Nightly clean-up of the «Бот и сайт» journal: rows older than {@code app.journal.retention-days}
 * (90 by default) are deleted — except money events (payments, invoices, receipts, refunds), which
 * stay {@code app.journal.money-retention-days} (3 years by default). A broadcast to everyone writes a row per customer, so without this
 * the table would only ever grow.
 */
@Slf4j
@Component
public class ActivityLogRetentionJob {

    private final ActivityLogStore store;
    private final int retentionDays;
    private final int moneyRetentionDays;
    private final Clock clock;

    @Autowired
    public ActivityLogRetentionJob(ActivityLogStore store, AppProperties props, Clock clock) {
        this(store, props.getJournal().getRetentionDays(), props.getJournal().getMoneyRetentionDays(), clock);
    }

    public ActivityLogRetentionJob(ActivityLogStore store, int retentionDays, int moneyRetentionDays, Clock clock) {
        this.store = store;
        this.clock = clock;
        this.retentionDays = Math.max(7, retentionDays);
        // never shorter than the general window, or money rows would go first
        this.moneyRetentionDays = Math.max(this.retentionDays, moneyRetentionDays);
    }

    public int moneyRetentionDays() {
        return moneyRetentionDays;
    }

    public int retentionDays() {
        return retentionDays;
    }

    @SchedulerLock(name = "ActivityLogRetentionJob.purge", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.journal.purge-cron:0 35 4 * * *}")
    public void purge() {
        try {
            Instant now = clock.instant();
            int n = store.purgeBefore(now.minus(Duration.ofDays(retentionDays)));
            if (n > 0) {
                log.info("Activity log: {} rows older than {} days removed", n, retentionDays);
            }
            int money = store.purgeMoneyBefore(now.minus(Duration.ofDays(moneyRetentionDays)));
            if (money > 0) {
                log.info("Activity log: {} money rows older than {} days removed", money, moneyRetentionDays);
            }
        } catch (Exception e) {
            log.warn("Activity log purge failed: {}", e.getMessage());
        }
    }
}
