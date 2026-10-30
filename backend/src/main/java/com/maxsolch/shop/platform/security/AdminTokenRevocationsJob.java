package com.maxsolch.shop.platform.security;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;

/** Rows outlive their token by nothing: once the token has expired it is refused anyway. */
@Slf4j
@Component
public class AdminTokenRevocationsJob {

    private final AdminRevokedTokenStore store;
    private final Clock clock;

    public AdminTokenRevocationsJob(AdminRevokedTokenStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @SchedulerLock(name = "AdminTokenRevocations.cleanup", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "0 17 * * * *")
    public void cleanup() {
        try {
            int removed = store.deleteExpired(clock.instant());
            if (removed > 0) {
                log.debug("Removed {} expired admin token revocations", removed);
            }
        } catch (Exception e) {
            log.warn("Admin token revocation cleanup failed: {}", e.getMessage());
        }
    }
}
