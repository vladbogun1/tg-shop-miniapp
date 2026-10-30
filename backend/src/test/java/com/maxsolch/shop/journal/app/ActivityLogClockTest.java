package com.maxsolch.shop.journal.app;

import com.maxsolch.shop.journal.infra.ActivityLogStore;
import com.maxsolch.shop.journal.domain.JournalOrders;
import com.maxsolch.shop.journal.domain.JournalPeople;
import com.maxsolch.shop.notification.app.TelegramFailures;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** The moment of a journal row comes from the injected clock, set once when the entry is recorded. */
class ActivityLogClockTest {

    private static final Instant T0 = Instant.parse("2026-10-30T10:00:00Z");

    @Test
    void rowIsTimestampedByTheClock() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ActivityLog log = new ActivityLog(new ActivityLogStore(jdbc, mock(JournalOrders.class), mock(JournalPeople.class)), new TelegramFailures(),
                mock(DomainEvents.class), mock(CurrentActor.class), Clock.fixed(T0, ZoneOffset.UTC),
                new SameThreadExecutor());

        log.record(ActivityLog.Entry.of(ActivityLog.SYSTEM, "TEST"));

        Object[] args = Mockito.mockingDetails(jdbc).getInvocations().iterator().next().getArguments();
        assertThat(args).contains(Timestamp.from(T0));
    }

    private static final class SameThreadExecutor extends AbstractExecutorService {
        @Override public void shutdown() { }
        @Override public List<Runnable> shutdownNow() { return List.of(); }
        @Override public boolean isShutdown() { return false; }
        @Override public boolean isTerminated() { return false; }
        @Override public boolean awaitTermination(long t, TimeUnit u) { return true; }
        @Override public void execute(Runnable r) { r.run(); }
    }
}
