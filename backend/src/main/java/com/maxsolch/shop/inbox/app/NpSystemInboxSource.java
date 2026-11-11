package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.delivery.app.NpAlerts;
import com.maxsolch.shop.inbox.app.InboxDtos.Item;
import com.maxsolch.shop.inbox.domain.InboxItemType;
import com.maxsolch.shop.inbox.domain.InboxMark;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** «Новая почта: сбои»: the integration's own alerts (sync, tracking, new status codes, tariff, sender branch). */
@Slf4j
@Component
public class NpSystemInboxSource implements InboxExtraSource {

    private final NpAlerts alerts;

    public NpSystemInboxSource(NpAlerts alerts) {
        this.alerts = alerts;
    }

    @Override
    public List<Item> items(Instant now) {
        try {
            return alerts.current().stream().map(a -> row(a, now)).toList();
        } catch (RuntimeException e) {
            log.warn("NP alert rows failed: {}", e.getMessage());
            return List.of();
        }
    }

    static Item row(NpAlerts.Alert a, Instant now) {
        String entity = a.kind().name();
        long wait = Math.max(0, Duration.between(a.since(), now).toMinutes());
        return new Item(InboxMark.key(InboxItemType.NP_SYSTEM, entity), InboxItemType.NP_SYSTEM.name(), entity,
                String.valueOf(a.since().toEpochMilli()), a.kind().title(), a.text(),
                null, null, null, null, null, null, null, null, null, null, a.since(), wait, a.kind().urgent());
    }
}
