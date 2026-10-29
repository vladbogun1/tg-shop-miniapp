package com.maxsolch.shop.delivery.app;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background schedule of the Nova Poshta directory sync. The work itself is {@link NovaPoshtaSyncService}. */
@Component
public class NovaPoshtaJobs {

    private final NovaPoshtaSyncService sync;

    public NovaPoshtaJobs(NovaPoshtaSyncService sync) {
        this.sync = sync;
    }

    /** Nightly. The lock name is the old one, so a node still on the previous release cannot run it at the same time. */
    @SchedulerLock(name = "NovaPoshtaSyncService.scheduledSync", lockAtMostFor = "PT1H", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.novaposhta.sync-cron:0 30 3 * * *}")
    public void nightlySync() {
        sync.syncIfEnabled();
    }
}
