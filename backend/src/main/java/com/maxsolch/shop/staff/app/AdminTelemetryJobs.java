package com.maxsolch.shop.staff.app;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Nightly: admin panel telemetry older than {@value AdminTelemetry#RETENTION_DAYS} days is deleted. */
@Slf4j
@Component
public class AdminTelemetryJobs {

    private final AdminTelemetry telemetry;

    public AdminTelemetryJobs(AdminTelemetry telemetry) {
        this.telemetry = telemetry;
    }

    @SchedulerLock(name = "AdminTelemetryJobs.purge", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "0 50 4 * * *")
    public void purge() {
        try {
            int removed = telemetry.purgeOld();
            if (removed > 0) {
                log.info("Admin telemetry: removed {} events older than {} days", removed, AdminTelemetry.RETENTION_DAYS);
            }
        } catch (Exception e) {
            log.warn("Admin telemetry purge failed: {}", e.getMessage());
        }
    }
}
