package com.maxsolch.shop.translation.app;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background jobs of the translation module. */
@Component
public class TranslationJobs {

    private final TranslationAdminService admin;

    public TranslationJobs(TranslationAdminService admin) {
        this.admin = admin;
    }

    /** Rows whose entity no longer exists (no FKs on the shared table). Daily. */
    @SchedulerLock(name = "TranslationAdminService.cleanupOrphans", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.translations.orphan-cleanup-cron:0 50 4 * * *}")
    public void cleanupOrphans() {
        admin.cleanupOrphans();
    }
}
