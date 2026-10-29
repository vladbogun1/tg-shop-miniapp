package com.maxsolch.shop.support;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Hourly: closes support threads inactive for {@code support.autoCloseDays}. */
@Slf4j
@Component
public class SupportJobs {

    private final SupportService support;

    public SupportJobs(SupportService support) {
        this.support = support;
    }

    @SchedulerLock(name = "SupportJobs.autoClose", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.support.auto-close-ms:3600000}", initialDelay = 300_000)
    public void autoClose() {
        try {
            int closed = support.autoClose();
            if (closed > 0) {
                log.info("Support: auto-closed {} inactive thread(s)", closed);
            }
        } catch (Exception e) {
            log.warn("Support auto-close failed: {}", e.getMessage());
        }
    }
}
