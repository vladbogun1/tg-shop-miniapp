package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.domain.LedgerDrift;
import com.maxsolch.shop.staff.infra.IncidentQueries;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Nightly check that every order's money columns match its money journal. Money changes and journal lines
 * are written by separate calls in about eight places; this is the net under them. It only reports (a warning
 * in the log, the same cases show up in «Инциденты»), it never fixes data. Order ids only — no customer data.
 */
@Slf4j
@Component
public class LedgerDriftJob {

    private static final int LOGGED_ORDERS = 20;

    private final IncidentQueries queries;

    public LedgerDriftJob(IncidentQueries queries) {
        this.queries = queries;
    }

    @SchedulerLock(name = "LedgerDriftJob.check", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.staff.ledger-drift-cron:0 30 3 * * *}")
    public void check() {
        List<LedgerDrift> drift = queries.ledgerDriftOrders();
        if (drift.isEmpty()) {
            return;
        }
        log.warn("Money journal drift: {} order(s) where received − refunded differs from the journal", drift.size());
        drift.stream().limit(LOGGED_ORDERS).forEach(d -> log.warn(
                "Money journal drift: order {} ({}): order {} minor, journal {} minor",
                d.orderRef(), d.status(), d.orderNetMinor(), d.journalNetMinor()));
    }
}
