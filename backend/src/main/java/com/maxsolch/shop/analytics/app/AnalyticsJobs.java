package com.maxsolch.shop.analytics.app;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Nightly: roll the event journal up into the daily tables, then purge journal rows past retention. */
@Component
public class AnalyticsJobs {

    private final AnalyticsAggregationService aggregation;
    private final ClientEventService events;

    public AnalyticsJobs(AnalyticsAggregationService aggregation, ClientEventService events) {
        this.aggregation = aggregation;
        this.events = events;
    }

    @SchedulerLock(name = "AnalyticsAggregationService.nightly", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.analytics.rollup-cron:0 30 3 * * *}", zone = "${app.timezone:Europe/Kyiv}")
    public void nightlyRollup() {
        aggregation.nightly();
    }

    @SchedulerLock(name = "ClientEventService.purgeOld", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.analytics.purge-cron:0 15 4 * * *}")
    public void purgeOld() {
        events.purgeOld();
    }
}
