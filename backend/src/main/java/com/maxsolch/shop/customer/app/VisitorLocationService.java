package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.web.GeoIpLookup;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import com.maxsolch.shop.platform.cache.CacheConfig;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.customer.infra.VisitorLocationStore;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
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

    private final VisitorLocationStore store;
    private final GeoIpLookup geo;
    private final Executor executor;
    private final Cache recent;
    private final boolean enabled;

    @Autowired
    public VisitorLocationService(VisitorLocationStore store, GeoIpLookup geo, AppProperties props,
                                  CacheManager caches, Workers workers) {
        this(store, geo, props.getGeoip().isEnabled(),
                CacheConfig.require(caches, CustomerCaches.VISITOR_LOCATION_RECENT),
                workers.bounded("visitor-location", 2_000, new ThreadPoolExecutor.DiscardPolicy(), Duration.ofSeconds(2)));
    }

    VisitorLocationService(VisitorLocationStore store, GeoIpLookup geo, boolean enabled, Cache recent,
                           Executor executor) {
        this.store = store;
        this.geo = geo;
        this.enabled = enabled;
        this.executor = executor;
        this.recent = recent;
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
            if (recent.putIfAbsent(key, Boolean.TRUE) != null) {
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
            store.upsert(key, telegramUserId, anonId, channel, ip,
                    p == null ? null : p.countryCode(),
                    p == null ? null : p.country(),
                    p == null ? null : p.city(),
                    p == null ? null : p.lat(),
                    p == null ? null : p.lon());
            if (supersededKey != null) {
                store.delete(supersededKey);
            }
        } catch (Exception e) {
            // Let the next request try again instead of waiting out the throttle.
            recent.evict(key);
            log.debug("Visitor location write failed for {}: {}", key, e.toString());
        }
    }

    @PreDestroy
    void shutdown() {
        if (executor instanceof ExecutorService es) {
            es.shutdown();
        }
    }
}
