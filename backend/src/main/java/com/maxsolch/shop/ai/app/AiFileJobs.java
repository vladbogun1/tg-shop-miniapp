package com.maxsolch.shop.ai.app;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every night: pictures older than 7 days leave the storage and the table (one run for the whole system). */
@Slf4j
@Component
public class AiFileJobs {

    private final AiFiles files;

    public AiFileJobs(AiFiles files) {
        this.files = files;
    }

    @SchedulerLock(name = "AiFileJobs.purge", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.ai.files-purge-cron:0 20 4 * * *}")
    public void purge() {
        try {
            int n = files.purgeExpired();
            if (n > 0) {
                log.info("ai: {} expired files removed", n);
            }
        } catch (RuntimeException e) {
            log.warn("ai file purge failed: {}", e.toString());
        }
    }
}
