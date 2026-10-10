package com.maxsolch.shop.analytics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.common.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Stores the event journal the Mini App and the website send in batches.
 *
 * <p>Two rules shape this: it is written in flushes rather than per tap, so the database is not
 * touched on every interaction; and nothing here may break the shop — a malformed or oversized
 * batch is trimmed and accepted, never rejected in a way the customer would notice.
 *
 * <p>Structured events ({@link StructuredEvents}) carry a JSON {@code meta}; its {@code productId}
 * is lifted into its own column so the nightly aggregation ({@link AnalyticsAggregationService})
 * never has to parse JSON in SQL.
 */
@Slf4j
@Service
public class ClientEventService {

    /** Per flush. The client batches ~every 15s; anything beyond this is noise or abuse. */
    private static final int MAX_EVENTS_PER_BATCH = 200;

    /** The open web gets a tighter cap: it is unauthenticated and only sends a handful of events. */
    private static final int MAX_WEB_EVENTS_PER_BATCH = 50;

    /**
     * This is a journal, not analytics storage — it is not kept forever. What outlives it is the
     * daily roll-up in {@code analytics_daily*} (written by {@link AnalyticsAggregationService}).
     */
    static final Duration RETENTION = Duration.ofDays(30);

    private static final Pattern ANON_ID = Pattern.compile("[A-Za-z0-9_-]{8,64}");

    private final ClientEventRepository repository;
    private final ObjectMapper objectMapper;

    public ClientEventService(ClientEventRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /** A Mini App flush: always a signed-in Telegram user. */
    @Transactional
    public int record(long telegramUserId, ClientEventBatch batch) {
        if (batch == null || batch.events() == null || batch.events().isEmpty()) {
            return 0;
        }
        String sessionId = trim(batch.sessionId(), 64);
        if (sessionId == null) {
            return 0;
        }
        return save(build(EventChannel.MINIAPP, telegramUserId, null, sessionId,
                batch.events(), MAX_EVENTS_PER_BATCH, false));
    }

    /**
     * A website flush. {@code telegramUserId} is null for a visitor who has not signed in; the
     * browser's anonymous id ties their events together either way. Only the structured events and
     * page views are accepted from the open web.
     */
    @Transactional
    public int recordWeb(Long telegramUserId, WebEventBatch batch) {
        if (batch == null || batch.events() == null || batch.events().isEmpty()) {
            return 0;
        }
        String anonId = trim(batch.anonId(), 64);
        if (anonId == null || !ANON_ID.matcher(anonId).matches()) {
            return 0;
        }
        String sessionId = trim(batch.sessionId(), 64);
        return save(build(EventChannel.WEB, telegramUserId, anonId,
                sessionId == null ? anonId : sessionId, batch.events(), MAX_WEB_EVENTS_PER_BATCH, true));
    }

    /**
     * A website flush with the sender's User-Agent: crawlers that run JavaScript (Googlebot, Bing,
     * link-preview and SEO bots, headless browsers) get a fresh {@code anonId} on every render and
     * each one used to become a new "Зашли" visitor. Their batches are dropped.
     */
    @Transactional
    public int recordWeb(Long telegramUserId, WebEventBatch batch, String userAgent) {
        if (isBot(userAgent)) {
            return 0;
        }
        return recordWeb(telegramUserId, batch);
    }

    private static final Pattern BOT_UA = Pattern.compile(
            // (?<!cu): Cubot is a phone brand ("CUBOT X30"), not a crawler
            "(?<!cu)bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|phantomjs|puppeteer|playwright|selenium"
                    + "|google-inspectiontool|chrome-lighthouse|facebookexternalhit|meta-externalagent|bingpreview"
                    + "|yandex|baiduspider|petalbot|ahrefs|semrush|mj12|dataprovider|python-requests|curl/|wget|go-http",
            Pattern.CASE_INSENSITIVE);

    /** A crawler / automated browser by its User-Agent; a missing User-Agent is not a real browser either. */
    public static boolean isBot(String userAgent) {
        return userAgent == null || userAgent.isBlank() || BOT_UA.matcher(userAgent).find();
    }

    private List<ClientEvent> build(EventChannel channel, Long telegramUserId, String anonId,
                                    String sessionId, List<ClientEventDto> events, int cap,
                                    boolean whitelistOnly) {
        Instant now = Instant.now();
        List<ClientEvent> rows = new ArrayList<>();
        for (ClientEventDto dto : events.stream().limit(cap).toList()) {
            String event = dto == null ? null : trim(dto.event(), 64);
            if (event == null) {
                continue;
            }
            if (whitelistOnly && !StructuredEvents.WEB_ALLOWED.contains(event)) {
                continue;
            }
            ClientEvent row = new ClientEvent();
            row.setChannel(channel);
            row.setTelegramUserId(telegramUserId);
            row.setAnonId(anonId);
            row.setSessionId(sessionId);
            row.setEvent(event);
            row.setTarget(trim(dto.target(), 255));
            row.setPath(trim(dto.path(), 255));
            row.setMeta(trim(dto.meta(), 512));
            row.setProductId(productIdOf(row.getMeta()));
            // A device clock can be wrong by years; keep the reported time but never let it order
            // events after the flush that carried them.
            row.setClientTime(dto.clientTime() == null || dto.clientTime().isAfter(now)
                    ? now : dto.clientTime());
            rows.add(row);
        }
        return rows;
    }

    private int save(List<ClientEvent> rows) {
        if (rows.isEmpty()) {
            return 0;
        }
        repository.saveAll(rows);
        return rows.size();
    }

    /** {@code productId} from a JSON meta, or null — never throws on a malformed payload. */
    byte[] productIdOf(String meta) {
        if (meta == null || meta.isEmpty() || meta.charAt(0) != '{') {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(meta).get("productId");
            if (node == null || !node.isTextual()) {
                return null;
            }
            return UuidUtil.toBytes(node.asText());
        } catch (Exception e) {
            return null;
        }
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
