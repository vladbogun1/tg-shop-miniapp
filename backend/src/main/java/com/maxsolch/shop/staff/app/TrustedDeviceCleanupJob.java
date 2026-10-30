package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.infra.TrustedDeviceStore;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/** Expired / revoked trusted devices are kept a month for the record, then dropped. */
@Slf4j
@Component
public class TrustedDeviceCleanupJob {

    private final TrustedDeviceStore store;
    private final Clock clock;

    public TrustedDeviceCleanupJob(TrustedDeviceStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @SchedulerLock(name = "TrustedDeviceService.cleanup", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "0 45 4 * * *")
    public void cleanup() {
        try {
            store.deleteOlderThan(clock.instant().minus(Duration.ofDays(30)));
        } catch (Exception e) {
            log.warn("Trusted device cleanup failed: {}", e.getMessage());
        }
    }
}
