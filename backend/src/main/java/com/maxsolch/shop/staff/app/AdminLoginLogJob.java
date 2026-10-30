package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.infra.AdminLoginLogStore;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/** Nightly: sign-in history older than the retention period is deleted. */
@Slf4j
@Component
public class AdminLoginLogJob {

    private final AdminLoginLogStore store;
    private final Clock clock;

    public AdminLoginLogJob(AdminLoginLogStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @SchedulerLock(name = "AdminLoginLogService.purge", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.security.admin-login-log-purge-cron:0 40 4 * * *}")
    public void purge() {
        try {
            int removed = store.deleteOlderThan(clock.instant().minus(Duration.ofDays(AdminLoginLogService.RETENTION_DAYS)));
            if (removed > 0) {
                log.info("Admin login log: removed {} entries older than {} days", removed,
                        AdminLoginLogService.RETENTION_DAYS);
            }
        } catch (Exception e) {
            log.warn("Admin login log purge failed: {}", e.getMessage());
        }
    }
}
