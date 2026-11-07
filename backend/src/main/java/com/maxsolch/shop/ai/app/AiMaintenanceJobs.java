package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.infra.AiLimitStore;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The housekeeping of the AI queue, one run for the whole system (ShedLock): jobs whose worker went silent are taken
 * back (once to the queue, then FAILED), reserves of jobs that are no longer running are dropped, and every night the
 * text of prompts and answers older than the retention is deleted (the price and the outcome of the job stay).
 */
@Slf4j
@Component
public class AiMaintenanceJobs {

    private final AiJobLifecycle lifecycle;
    private final AiLimitStore reserves;
    private final AiPolicy policy;

    public AiMaintenanceJobs(AiJobLifecycle lifecycle, AiLimitStore reserves, AiPolicy policy) {
        this.lifecycle = lifecycle;
        this.reserves = reserves;
        this.policy = policy;
    }

    @SchedulerLock(name = "AiMaintenanceJobs.reap", lockAtMostFor = "PT2M", lockAtLeastFor = "PT10S")
    @Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT45S")
    public void reap() {
        try {
            int taken = lifecycle.reap();
            int orphans = reserves.deleteOrphans();
            if (taken > 0 || orphans > 0) {
                log.info("ai reaper: {} silent jobs taken back, {} stale reserves dropped", taken, orphans);
            }
        } catch (RuntimeException e) {
            log.warn("ai reaper failed: {}", e.toString());
        }
    }

    @SchedulerLock(name = "AiMaintenanceJobs.purgeBodies", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.ai.purge-cron:0 50 4 * * *}")
    public void purgeBodies() {
        try {
            int n = lifecycle.purgeBodies(policy.retention());
            if (n > 0) {
                log.info("ai: {} prompts and answers older than {} removed", n, policy.retention());
            }
        } catch (RuntimeException e) {
            log.warn("ai body purge failed: {}", e.toString());
        }
    }
}
