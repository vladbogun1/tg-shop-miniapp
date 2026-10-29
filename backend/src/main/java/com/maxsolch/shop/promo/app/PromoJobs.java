package com.maxsolch.shop.promo.app;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background side of promo codes: tidies the table of customers' holds. */
@Component
public class PromoJobs {

    private final PromoService promos;

    public PromoJobs(PromoService promos) {
        this.promos = promos;
    }

    /**
     * Expired holds are already ignored by every query; this only keeps the table from growing forever.
     */
    @SchedulerLock(name = "PromoService.sweepExpired", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.promo.reservation-sweep-ms:600000}", initialDelay = 60_000)
    public void sweepExpired() {
        promos.sweepExpired();
    }
}
