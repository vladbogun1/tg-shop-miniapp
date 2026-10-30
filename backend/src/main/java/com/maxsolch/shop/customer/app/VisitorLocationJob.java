package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.VisitorLocationStore;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Nightly: visitor places older than the retention period are deleted (the privacy policy promises it). */
@Slf4j
@Component
public class VisitorLocationJob {

    private final VisitorLocationStore store;

    public VisitorLocationJob(VisitorLocationStore store) {
        this.store = store;
    }

    @SchedulerLock(name = "VisitorLocationService.purgeOld", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.geoip.purge-cron:0 25 4 * * *}")
    public void purgeOld() {
        try {
            int removed = store.purgeOlderThan(VisitorLocationService.RETENTION_DAYS);
            if (removed > 0) {
                log.info("Purged {} visitor location(s) older than {} days", removed, VisitorLocationService.RETENTION_DAYS);
            }
        } catch (Exception e) {
            log.warn("Visitor location purge failed: {}", e.toString());
        }
    }
}
