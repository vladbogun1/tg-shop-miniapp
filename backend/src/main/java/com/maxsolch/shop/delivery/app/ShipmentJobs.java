package com.maxsolch.shop.delivery.app;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every 30 minutes ({@code app.novaposhta.tracking-cron}): ask Nova Poshta about the open waybills, then drop old
 * webhook claims. One node at a time ({@code @SchedulerLock}); the work is {@link ShipmentTrackingService}.
 */
@Slf4j
@Component
public class ShipmentJobs {

    private final ShipmentTrackingService tracking;
    private final NpWebhookService webhooks;

    public ShipmentJobs(ShipmentTrackingService tracking, NpWebhookService webhooks) {
        this.tracking = tracking;
        this.webhooks = webhooks;
    }

    @SchedulerLock(name = "ShipmentJobs.track", lockAtMostFor = "PT25M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.novaposhta.tracking-cron:0 */30 * * * *}", zone = "${app.timezone:Europe/Kyiv}")
    public void track() {
        try {
            int n = tracking.pollDue();
            if (n > 0) {
                log.info("NP tracking: polled {} waybills", n);
            }
            webhooks.purgeOld();
        } catch (RuntimeException e) {
            log.warn("NP tracking job failed: {}", e.getMessage());
        }
    }
}
