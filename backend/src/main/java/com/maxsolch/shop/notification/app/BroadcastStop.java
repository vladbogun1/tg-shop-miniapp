package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.notification.domain.Broadcast;
import com.maxsolch.shop.notification.domain.NotificationError;
import com.maxsolch.shop.notification.infra.BroadcastRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

/**
 * «Остановить» у идущей рассылки. Только ставит флаг в таблице {@code broadcasts} (V84): поток отправки
 * (на этом или другом экземпляре бэкенда) читает его каждые несколько получателей, прекращает отправку и сам
 * закрывает рассылку статусом STOPPED. Уже отправленное остаётся, неотправленное не уходит.
 *
 * <p>Идемпотентно: повторное нажатие (пока поток дозавершается или когда рассылка уже STOPPED) возвращает ту же
 * рассылку и не пишет второй раз в аудит; на завершённую иначе рассылку отвечает 409.
 */
@Service
public class BroadcastStop {

    private final BroadcastRepository broadcasts;
    private final AdminAuditService audit;
    private final CurrentActor actor;
    private final Clock clock;

    public BroadcastStop(BroadcastRepository broadcasts, AdminAuditService audit, CurrentActor actor, Clock clock) {
        this.broadcasts = broadcasts;
        this.audit = audit;
        this.actor = actor;
        this.clock = clock;
    }

    @Transactional
    public BroadcastHistoryDto stop() {
        Broadcast last = broadcasts.recent(PageRequest.of(0, 1)).stream().findFirst()
                .orElseThrow(() -> new DomainException.Conflict(NotificationError.BROADCAST_NOT_RUNNING));
        if (Broadcast.STOPPED.equals(last.getStatus())) {
            return BroadcastHistoryDto.of(last);
        }
        if (!Broadcast.RUNNING.equals(last.getStatus())) {
            throw new DomainException.Conflict(NotificationError.BROADCAST_NOT_RUNNING);
        }
        int changed = broadcasts.requestStop(last.getId(), clock.instant(), actor.userId(), audit.currentAdminName());
        if (changed > 0) {
            audit.record("BROADCAST_STOP", "BROADCAST", String.valueOf(last.getId()),
                    "остановка рассылки, получателей " + last.getTotal() + " (итог — в истории рассылок)");
        }
        return BroadcastHistoryDto.of(broadcasts.findById(last.getId()).orElse(last));
    }
}
