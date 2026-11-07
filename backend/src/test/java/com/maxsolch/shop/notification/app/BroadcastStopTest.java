package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.notification.domain.Broadcast;
import com.maxsolch.shop.notification.domain.BroadcastAudiences;
import com.maxsolch.shop.notification.domain.TelegramGateway;
import com.maxsolch.shop.notification.infra.BroadcastRepository;
import com.maxsolch.shop.notification.infra.NotificationProperties;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Message;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Остановить»: флаг в БД останавливает рассылку посреди списка; повторная остановка ничего не меняет. */
class BroadcastStopTest {

    private final AtomicBoolean stopFlag = new AtomicBoolean();
    private final AtomicReference<Broadcast> saved = new AtomicReference<>();
    private final AtomicInteger sends = new AtomicInteger();

    /** A sender whose database stop flag is {@link #stopFlag}; the 15th message simulates another instance pressing the button. */
    private BroadcastService sender(int recipients) throws Exception {
        TelegramGateway bot = mock(TelegramGateway.class);
        when(bot.execute(any(SendMessage.class))).thenAnswer(inv -> {
            if (sends.incrementAndGet() == 15) {
                stopFlag.set(true);
            }
            return new Message();
        });
        BroadcastAudiences users = mock(BroadcastAudiences.class);
        List<Long> ids = new ArrayList<>();
        for (long i = 1; i <= recipients; i++) {
            ids.add(i);
        }
        when(users.ids(any())).thenReturn(ids);
        when(users.reachable()).thenReturn(List.of());
        NotificationProperties props = new NotificationProperties();
        props.getTelegram().setBotToken("123:test");
        ActivityLog activity = mock(ActivityLog.class);
        when(activity.bot(any(), any())).thenAnswer(inv -> ((ActivityLog.BotCall<?, ?>) inv.getArgument(1)).call());
        BroadcastRepository repo = mock(BroadcastRepository.class);
        when(repo.save(any())).thenAnswer(inv -> {
            Broadcast b = inv.getArgument(0);
            ReflectionTestUtils.setField(b, "id", 7L);
            saved.set(b);
            return b;
        });
        when(repo.existsByIdAndStopRequestedAtIsNotNull(7L)).thenAnswer(inv -> stopFlag.get());
        when(repo.stoppedByName(7L)).thenReturn("Anna");
        return new BroadcastService(bot, props, users, repo, activity, Clock.systemUTC(),
                mock(AdminAuditService.class), mock(CurrentActor.class),
                new DbLocks(new InMemoryLockProvider(), Clock.systemUTC()), new Workers(),
                new BroadcastPhotoStore(new ConcurrentMapCacheManager("broadcastPhotos")));
    }

    private static BroadcastRequest request() {
        return new BroadcastRequest("hi", "all", false, null, null, null, null, null, null);
    }

    @Test
    void stopFlagInTheDatabaseEndsTheBroadcastMidList_andKeepsWhatWasSent() throws Exception {
        BroadcastService svc = sender(100);

        svc.start(request(), 1L, "Max");
        await().atMost(Duration.ofSeconds(15)).until(() -> !svc.status().running());

        BroadcastStatus st = svc.status();
        assertThat(st.stopped()).isTrue();
        assertThat(st.stoppedBy()).isEqualTo("Anna");
        assertThat(st.total()).isEqualTo(100);
        // the flag is read every 10 recipients: raised during the 15th, seen before the 21st
        assertThat(st.sent()).isEqualTo(20);
        assertThat(sends.get()).isEqualTo(20);
        assertThat(saved.get().getStatus()).isEqualTo(Broadcast.STOPPED);
        assertThat(saved.get().getSent()).isEqualTo(20);
        assertThat(saved.get().getFinishedAt()).isNotNull();
    }

    @Test
    void withoutTheFlagTheBroadcastIsDone() throws Exception {
        BroadcastService svc = sender(12); // the 15th send never happens, so the flag stays down

        svc.start(request(), 1L, "Max");
        await().atMost(Duration.ofSeconds(15)).until(() -> !svc.status().running());

        assertThat(svc.status().stopped()).isFalse();
        assertThat(saved.get().getStatus()).isEqualTo(Broadcast.DONE);
        assertThat(saved.get().getSent()).isEqualTo(12);
    }

    // ---- BroadcastStop: the button ----

    private final BroadcastRepository repo = mock(BroadcastRepository.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final BroadcastStop stop = new BroadcastStop(repo, audit, actor, Clock.systemUTC());

    private Broadcast row(String status) {
        Broadcast b = new Broadcast();
        ReflectionTestUtils.setField(b, "id", 7L);
        b.setText("hi");
        b.setAudience("all");
        b.setStatus(status);
        b.setTotal(100);
        b.setSent(30);
        b.setStartedAt(Instant.parse("2026-11-07T10:00:00Z"));
        return b;
    }

    @Test
    void pressingStopSetsTheFlagOnce_andAuditsOnce() {
        Broadcast running = row(Broadcast.RUNNING);
        when(repo.recent(any(Pageable.class))).thenReturn(List.of(running));
        when(actor.userId()).thenReturn(5L);
        when(audit.currentAdminName()).thenReturn("Anna");
        when(repo.requestStop(eq(7L), any(), eq(5L), eq("Anna"))).thenReturn(1, 0);
        when(repo.findById(7L)).thenReturn(Optional.of(running));

        BroadcastHistoryDto first = stop.stop();
        BroadcastHistoryDto second = stop.stop();

        assertThat(first.id()).isEqualTo(7L);
        assertThat(second.id()).isEqualTo(7L);
        verify(audit, times(1)).record(eq("BROADCAST_STOP"), eq("BROADCAST"), eq("7"), any());
    }

    @Test
    void stoppingAnAlreadyStoppedBroadcastChangesNothing_andReportsTheRemainder() {
        Broadcast stopped = row(Broadcast.STOPPED);
        ReflectionTestUtils.setField(stopped, "stoppedByName", "Anna");
        when(repo.recent(any(Pageable.class))).thenReturn(List.of(stopped));

        BroadcastHistoryDto dto = stop.stop();

        assertThat(dto.status()).isEqualTo("STOPPED");
        assertThat(dto.remaining()).isEqualTo(70);
        assertThat(dto.stoppedByName()).isEqualTo("Anna");
        verify(repo, never()).requestStop(anyLong(), any(), any(), any());
        verify(audit, never()).record(any(), any(), any(), any());
    }

    @Test
    void nothingToStopWhenTheLastBroadcastIsDone() {
        when(repo.recent(any(Pageable.class))).thenReturn(List.of(row(Broadcast.DONE)));

        assertThatThrownBy(stop::stop).isInstanceOfSatisfying(DomainException.Conflict.class,
                e -> assertThat(e.kind().httpStatus()).isEqualTo(409));
        verify(repo, never()).requestStop(anyLong(), any(), any(), any());
    }
}
