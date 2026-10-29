package com.maxsolch.shop.preorder.app;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Ends holds past their 24 h (the unit goes to the next person) and reminds of holds about to end. */
@Component
public class PreorderJobs {

    private static final Logger log = LoggerFactory.getLogger(PreorderJobs.class);

    private final PreorderQueueService queue;

    public PreorderJobs(PreorderQueueService queue) {
        this.queue = queue;
    }

    @SchedulerLock(name = "PreorderJobs.holds", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.preorder.holds-ms:300000}", initialDelay = 120_000)
    public void holds() {
        try {
            int expired = queue.expireHolds();
            int reminded = queue.remindHolds();
            if (expired > 0 || reminded > 0) {
                log.info("Preorder holds: expired {}, reminded {}", expired, reminded);
            }
        } catch (RuntimeException e) {
            log.warn("Preorder holds job failed: {}", e.toString());
        }
    }
}
