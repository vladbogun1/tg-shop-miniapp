package com.maxsolch.shop.geo;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Remembers where a visitor was last seen from: IP, time, and (when the GeoIP base is there)
 * country / city / coordinates. Feeds the users map in the admin.
 *
 * <p>Three rules, because this sits on the hot path of every customer request:
 * <ul>
 *   <li><b>Throttled in memory</b> — one write per visitor per {@code app.geoip.throttle}
 *       (15 min by default); every other request costs a cache lookup.</li>
 *   <li><b>Asynchronous</b> — the lookup and the upsert run on one background thread with a
 *       bounded queue; when it is full the update is dropped, never the request.</li>
 *   <li><b>Never throws</b> — any failure is logged at debug and forgotten.</li>
 * </ul>
 * Only the latest value per visitor is kept (no history); rows older than 90 days are deleted.
 */
@Slf4j
@Service
public class VisitorLocationService {

    public static final String MINIAPP = "MINIAPP";
    public static final String WEB = "WEB";

    /** Privacy policy: IP + approximate place are kept for up to 90 days. */
    static final int RETENTION_DAYS = 90;

    private static final Pattern ANON_ID = Pattern.compile("[A-Za-z0-9_-]{8,64}");

    private static final String UPSERT = "INSERT INTO visitor_locations "
            + "(visitor_key, telegram_user_id, anon_id, channel, ip, country_code, country, city, lat, lon, seen_at) "
            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) "
            + "ON DUPLICATE KEY UPDATE telegram_user_id = VALUES(telegram_user_id), anon_id = VALUES(anon_id), "
            + "channel = VALUES(channel), ip = VALUES(ip), country_code = VALUES(country_code), "
            + "country = VALUES(country), city = VALUES(city), lat = VALUES(lat), lon = VALUES(lon), "
            + "seen_at = CURRENT_TIMESTAMP";

    private final JdbcTemplate jdbc;
    private final GeoIpLookup geo;
    private final Executor executor;
    private final Cache<String, Boolean> recent;
    private final boolean enabled;

    @Autowired
    public VisitorLocationService(JdbcTemplate jdbc, GeoIpLookup geo,
                                  @Value("${app.geoip.enabled:true}") boolean enabled,
                                  @Value("${app.geoip.throttle:PT15M}") Duration throttle) {
        this(jdbc, geo, enabled, throttle, newWorker());
    }

    VisitorLocationService(JdbcTemplate jdbc, GeoIpLookup geo, boolean enabled, Duration throttle,
                           Executor executor) {
        this.jdbc = jdbc;
        this.geo = geo;
        this.enabled = enabled;
        this.executor = executor;
        this.recent = Caffeine.newBuilder()
                .expireAfterWrite(throttle)
                .maximumSize(200_000)
                .build();
    }

    private static ExecutorService newWorker() {
        ThreadPoolExecutor pool = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(2_000), r -> {
                    Thread t = new Thread(r, "visitor-location");
                    t.setDaemon(true);
                    return t;
                }, new ThreadPoolExecutor.DiscardPolicy());
        return pool;
    }

    /** A request from a signed-in customer (Mini App or the site's cookie session). */
    public void touchUser(long telegramUserId, String channel, String ip) {
        touch("tg:" + telegramUserId, telegramUserId, null, channel, ip, null);
    }

    /**
     * A website analytics flush. Anonymous visitors are keyed by their browser id; a signed-in one
     * by their Telegram id, and the row their anonymous id may have left before sign-in is dropped
     * so one person is one point on the map.
     */
    public void touchWeb(Long telegramUserId, String anonId, String ip) {
        String anon = anonId != null && ANON_ID.matcher(anonId).matches() ? anonId : null;
        if (telegramUserId != null) {
            touch("tg:" + telegramUserId, telegramUserId, null, WEB, ip, anon == null ? null : "anon:" + anon);
        } else if (anon != null) {
            touch("anon:" + anon, null, anon, WEB, ip, null);
        }
    }

    private void touch(String key, Long telegramUserId, String anonId, String channel, String ip,
                       String supersededKey) {
        try {
            if (!enabled || ip == null || ip.isBlank() || "unknown".equals(ip)) {
                return;
            }
            if (recent.asMap().putIfAbsent(key, Boolean.TRUE) != null) {
                return; // written recently
            }
            String addr = ip.length() > 45 ? ip.substring(0, 45) : ip;
            executor.execute(() -> write(key, telegramUserId, anonId, channel, addr, supersededKey));
        } catch (Exception e) {
            log.debug("Visitor location skipped: {}", e.toString());
        }
    }

    private void write(String key, Long telegramUserId, String anonId, String channel, String ip,
                       String supersededKey) {
        try {
            GeoIpLookup.Place p = geo.lookup(ip).orElse(null);
            jdbc.update(UPSERT, key, telegramUserId, anonId, channel, ip,
                    p == null ? null : p.countryCode(),
                    p == null ? null : p.country(),
                    p == null ? null : p.city(),
                    p == null ? null : p.lat(),
                    p == null ? null : p.lon());
            if (supersededKey != null) {
                jdbc.update("DELETE FROM visitor_locations WHERE visitor_key = ?", supersededKey);
            }
        } catch (Exception e) {
            // Let the next request try again instead of waiting out the throttle.
            recent.invalidate(key);
            log.debug("Visitor location write failed for {}: {}", key, e.toString());
        }
    }

    @Scheduled(cron = "${app.geoip.purge-cron:0 25 4 * * *}")
    public void purgeOld() {
        try {
            int removed = jdbc.update("DELETE FROM visitor_locations WHERE seen_at < NOW() - INTERVAL "
                    + RETENTION_DAYS + " DAY");
            if (removed > 0) {
                log.info("Purged {} visitor location(s) older than {} days", removed, RETENTION_DAYS);
            }
        } catch (Exception e) {
            log.warn("Visitor location purge failed: {}", e.toString());
        }
    }

    @PreDestroy
    void shutdown() {
        if (executor instanceof ExecutorService es) {
            es.shutdown();
        }
    }
}
