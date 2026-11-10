package com.maxsolch.shop.translation.app;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background jobs of the translation module. */
@Component
public class TranslationJobs {

    private final TranslationAdminService admin;
    private final AutoTranslation auto;

    public TranslationJobs(TranslationAdminService admin, AutoTranslation auto) {
        this.admin = admin;
        this.auto = auto;
    }

    /** Rows whose entity no longer exists (no FKs on the shared table). Daily. */
    @SchedulerLock(name = "TranslationAdminService.cleanupOrphans", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.translations.orphan-cleanup-cron:0 50 4 * * *}")
    public void cleanupOrphans() {
        admin.cleanupOrphans();
    }

    /**
     * New and changed Russian texts → uk/en by the machine translator. Every 2 minutes: saves of one text within the pause
     * are sent once, as the last version.
     */
    @SchedulerLock(name = "AutoTranslation.run", lockAtMostFor = "PT20M", lockAtLeastFor = "PT30S")
    @Scheduled(fixedDelayString = "${app.translations.auto.interval:PT2M}", initialDelayString = "PT90S")
    public void autoTranslate() {
        auto.runOnce();
    }
}
