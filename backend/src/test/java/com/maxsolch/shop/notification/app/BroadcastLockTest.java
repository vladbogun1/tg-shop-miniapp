package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.notification.domain.BroadcastAudiences;
import com.maxsolch.shop.notification.domain.TelegramGateway;
import com.maxsolch.shop.notification.infra.BroadcastRepository;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.Test;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Message;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** "One broadcast at a time" holds across backend instances: the guard is a database lock, not a Java monitor. */
class BroadcastLockTest {

    private final InMemoryLockProvider table = new InMemoryLockProvider();
    private final CountDownLatch release = new CountDownLatch(1);

    private BroadcastService instance() throws Exception {
        TelegramGateway bot = mock(TelegramGateway.class);
        when(bot.execute(any(SendMessage.class))).thenAnswer(inv -> {
            release.await(10, TimeUnit.SECONDS);
            return new Message();
        });
        BroadcastAudiences users = mock(BroadcastAudiences.class);
        when(users.ids(any())).thenReturn(List.of(42L));
        when(users.reachable()).thenReturn(List.of());
        AppProperties props = new AppProperties();
        props.getTelegram().setBotToken("123:test");
        ActivityLog activity = mock(ActivityLog.class);
        when(activity.bot(any(), any())).thenAnswer(inv -> ((ActivityLog.BotCall<?, ?>) inv.getArgument(1)).call());
        BroadcastRepository repo = mock(BroadcastRepository.class);
        when(repo.save(any())).thenAnswer(inv -> {
            com.maxsolch.shop.notification.domain.Broadcast b = inv.getArgument(0);
            org.springframework.test.util.ReflectionTestUtils.setField(b, "id", 7L);
            return b;
        });
        return new BroadcastService(bot, props, users, repo, activity, Clock.systemUTC(),
                mock(AdminAuditService.class), mock(CurrentActor.class),
                new DbLocks(table, Clock.systemUTC()), new com.maxsolch.shop.platform.jobs.Workers());
    }

    private static BroadcastRequest request() {
        return new BroadcastRequest("hi", "all", false, null, null, null, null, null);
    }

    @Test
    void secondInstanceIsRefusedWhileTheFirstBroadcastRuns_andMayStartAfterIt() throws Exception {
        BroadcastService first = instance();
        BroadcastService second = instance();

        first.start(request(), 1L, "Max");

        assertThatThrownBy(() -> second.start(request(), 2L, "Anna"))
                .isInstanceOfSatisfying(DomainException.Conflict.class, e ->
                        assertThat(e.kind().httpStatus()).isEqualTo(409));

        release.countDown();
        await().atMost(Duration.ofSeconds(10)).until(() -> !first.status().running());
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(second.start(request(), 2L, "Anna")).isNotNull());
    }

    @Test
    void aFailedStartDoesNotKeepTheLock() throws Exception {
        BroadcastService svc = instance();
        BroadcastService other = instance();
        // an audience read that blows up after the lock was taken
        BroadcastAudiences broken = mock(BroadcastAudiences.class);
        when(broken.ids(any())).thenThrow(new IllegalStateException("db down"));
        BroadcastService failing = new BroadcastService(mock(TelegramGateway.class), tokenProps(), broken,
                mock(BroadcastRepository.class), mock(ActivityLog.class), Clock.systemUTC(),
                mock(AdminAuditService.class), mock(CurrentActor.class), new DbLocks(table, Clock.systemUTC()), new com.maxsolch.shop.platform.jobs.Workers());

        assertThatThrownBy(() -> failing.start(request(), 1L, "Max")).isInstanceOf(IllegalStateException.class);

        release.countDown();
        assertThat(other.start(request(), 2L, "Anna")).isNotNull();
        assertThat(svc).isNotNull();
    }

    private static AppProperties tokenProps() {
        AppProperties props = new AppProperties();
        props.getTelegram().setBotToken("123:test");
        return props;
    }
}
