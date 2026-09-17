package com.maxsolch.shop.analytics;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Stores the click journal the Mini App sends in batches.
 *
 * <p>Two rules shape this: it is written in flushes rather than per tap, so the database is not
 * touched on every interaction; and nothing here may break the shop — a malformed or oversized
 * batch is trimmed and accepted, never rejected in a way the customer would notice.
 */
@Slf4j
@Service
public class ClientEventService {

    /** Per flush. The client batches ~every 15s; anything beyond this is noise or abuse. */
    private static final int MAX_EVENTS_PER_BATCH = 200;

    /** This is a debugging journal, not analytics storage — it is not kept forever. */
    private static final Duration RETENTION = Duration.ofDays(30);

    private final ClientEventRepository repository;

    public ClientEventService(ClientEventRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public int record(long telegramUserId, ClientEventBatch batch) {
        if (batch == null || batch.events() == null || batch.events().isEmpty()) {
            return 0;
        }
        String sessionId = trim(batch.sessionId(), 64);
        if (sessionId == null) {
            return 0;
        }
        Instant now = Instant.now();
        List<ClientEvent> rows = new ArrayList<>();
        for (ClientEventDto dto : batch.events().stream().limit(MAX_EVENTS_PER_BATCH).toList()) {
            if (dto == null || trim(dto.event(), 64) == null) {
                continue;
            }
            ClientEvent row = new ClientEvent();
            row.setTelegramUserId(telegramUserId);
            row.setSessionId(sessionId);
            row.setEvent(trim(dto.event(), 64));
            row.setTarget(trim(dto.target(), 255));
            row.setPath(trim(dto.path(), 255));
            row.setMeta(trim(dto.meta(), 512));
            // A device clock can be wrong by years; keep the reported time but never let it order
            // events after the flush that carried them.
            row.setClientTime(dto.clientTime() == null || dto.clientTime().isAfter(now)
                    ? now : dto.clientTime());
            rows.add(row);
        }
        if (rows.isEmpty()) {
            return 0;
        }
        repository.saveAll(rows);
        return rows.size();
    }

    @Scheduled(cron = "${app.analytics.purge-cron:0 15 4 * * *}")
    @Transactional
    public void purgeOld() {
        int removed = repository.deleteOlderThan(Instant.now().minus(RETENTION));
        if (removed > 0) {
            log.info("Purged {} client event(s) older than {} days", removed, RETENTION.toDays());
        }
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        String v = value.strip();
        if (v.isEmpty()) {
            return null;
        }
        return v.length() <= max ? v : v.substring(0, max);
    }
}
