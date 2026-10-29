package com.maxsolch.shop.platform.journal;

import lombok.extern.slf4j.Slf4j;
import com.maxsolch.shop.platform.config.AppProperties;
import org.springframework.beans.factory.annotation.Autowired;
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
public class ActivityLogRetention {

    private final ActivityLogStore store;
    private final int retentionDays;
    private final int moneyRetentionDays;

    @Autowired
    public ActivityLogRetention(ActivityLogStore store, AppProperties props) {
        this(store, props.getJournal().getRetentionDays(), props.getJournal().getMoneyRetentionDays());
    }

    public ActivityLogRetention(ActivityLogStore store, int retentionDays, int moneyRetentionDays) {
        this.store = store;
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

    @Scheduled(cron = "${app.journal.purge-cron:0 35 4 * * *}")
    public void purge() {
        try {
            Instant now = Instant.now();
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
