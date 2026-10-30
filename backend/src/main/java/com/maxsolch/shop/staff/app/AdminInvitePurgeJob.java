package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.domain.AdminInviteStore;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/** Used / revoked / expired invites are kept 90 days for the record. */
@Slf4j
@Component
public class AdminInvitePurgeJob {

    private final AdminInviteStore store;
    private final Clock clock;

    public AdminInvitePurgeJob(AdminInviteStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @SchedulerLock(name = "AdminInviteService.purge", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "0 50 4 * * *")
    public void purge() {
        try {
            int n = store.purge(clock.instant().minus(Duration.ofDays(90)));
            if (n > 0) {
                log.info("Admin invites: removed {} old rows", n);
            }
        } catch (Exception e) {
            log.warn("Admin invite purge failed: {}", e.getMessage());
        }
    }
}
