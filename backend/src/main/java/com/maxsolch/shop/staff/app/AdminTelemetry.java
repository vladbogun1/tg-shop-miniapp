package com.maxsolch.shop.staff.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.staff.domain.AdminClientEvent;
import com.maxsolch.shop.staff.infra.AdminClientEventStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Telemetry of the admin panel itself (V99): the panel reports errors, freezes and dead taps from the admins' phones,
 * the main admin reads them. Writing never fails the panel: bad input is dropped, a database failure is logged and
 * swallowed — telemetry is the last thing that may break the screen it is watching.
 */
@Slf4j
@Service
public class AdminTelemetry {

    /** Events per request; the rest of a bigger batch is dropped. */
    public static final int MAX_BATCH = 50;
    /** Size of {@code meta} as stored (UTF-8 bytes). */
    public static final int META_MAX_BYTES = 2048;
    /** Per admin: at most this many events stored in {@link #RATE_WINDOW}. */
    public static final int RATE_LIMIT = 300;
    public static final Duration RATE_WINDOW = Duration.ofMinutes(10);
    public static final int RETENTION_DAYS = 30;
    public static final int LIST_DEFAULT = 100;
    public static final int LIST_MAX = 500;

    private final AdminClientEventStore store;
    private final CurrentActor actor;
    private final Clock clock;

    public AdminTelemetry(AdminClientEventStore store, CurrentActor actor, Clock clock) {
        this.store = store;
        this.actor = actor;
        this.clock = clock;
    }

    /** @return how many events were stored (unknown kinds, overflow and the rate limit drop the rest) */
    @Transactional
    public int record(TelemetryBatch batch) {
        if (batch == null || batch.events() == null || batch.events().isEmpty()) {
            return 0;
        }
        long adminId = actor.userId();
        Instant now = clock.instant();
        List<AdminClientEvent> rows = new ArrayList<>();
        for (TelemetryBatch.Event e : batch.events().subList(0, Math.min(MAX_BATCH, batch.events().size()))) {
            if (e != null && e.kind() != null && AdminClientEvent.KINDS.contains(e.kind())) {
                rows.add(toRow(adminId, e, now));
            }
        }
        if (rows.isEmpty()) {
            return 0;
        }
        try {
            int budget = RATE_LIMIT - store.countSince(adminId, now.minus(RATE_WINDOW));
            if (budget <= 0) {
                return 0;
            }
            List<AdminClientEvent> kept = rows.size() > budget ? rows.subList(0, budget) : rows;
            store.insertAll(kept);
            return kept.size();
        } catch (DataAccessException ex) {
            log.warn("Admin telemetry: {} events of admin {} not stored: {}", rows.size(), adminId, ex.getMessage());
            return 0;
        }
    }

    /** Latest events, newest first (main admin). {@code limit} is clamped to 1…{@value #LIST_MAX}. */
    @Transactional(readOnly = true)
    public List<AdminClientEvent> latest(Integer limit, String kind, Long adminId) {
        int n = limit == null ? LIST_DEFAULT : Math.max(1, Math.min(LIST_MAX, limit));
        String k = kind == null || kind.isBlank() ? null : kind.strip();
        return store.latest(n, k, adminId);
    }

    /** Nightly purge (see {@link AdminTelemetryJobs}). */
    @Transactional
    public int purgeOld() {
        return store.deleteOlderThan(clock.instant().minus(Duration.ofDays(RETENTION_DAYS)));
    }

    private static AdminClientEvent toRow(long adminId, TelemetryBatch.Event e, Instant now) {
        return new AdminClientEvent(null, adminId, e.kind(), AdminClientEvent.cap(e.path(), AdminClientEvent.PATH_MAX),
                AdminClientEvent.cap(e.build(), AdminClientEvent.BUILD_MAX), AdminClientEvent.cap(e.ua(), AdminClientEvent.UA_MAX),
                Boolean.TRUE.equals(e.standalone()), metaOf(e.meta()), now);
    }

    /**
     * {@code meta} as JSON text of at most {@value #META_MAX_BYTES} bytes. Cutting the text would break the JSON (and the
     * insert into the JSON column), so an oversized object loses its {@code trail} first and is then replaced whole.
     */
    static String metaOf(JsonNode meta) {
        if (meta == null || meta.isNull() || meta.isMissingNode()) {
            return null;
        }
        String text = meta.toString();
        if (fits(text)) {
            return text;
        }
        if (meta instanceof ObjectNode obj && obj.has("trail")) {
            ObjectNode copy = obj.deepCopy();
            copy.remove("trail");
            copy.put("trailDropped", true);
            String shorter = copy.toString();
            if (fits(shorter)) {
                return shorter;
            }
        }
        return "{\"truncated\":true}";
    }

    private static boolean fits(String text) {
        return text.getBytes(StandardCharsets.UTF_8).length <= META_MAX_BYTES;
    }
}
