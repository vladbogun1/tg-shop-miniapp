package com.maxsolch.shop.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.push.PushSubscriptionStore.Subscription;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Web Push to the admin's devices (the installed admin PWA / a desktop browser).
 *
 * <p>Off unless {@code VAPID_PUBLIC_KEY}, {@code VAPID_PRIVATE_KEY} and {@code VAPID_SUBJECT} are
 * all set and form a valid P-256 pair — a missing or broken key is a WARN at startup, never a
 * failed start. Sending runs on a thread owned here, so a slow push service never holds a request
 * or a database transaction. Subscriptions the push service reports as gone (404/410) are
 * deleted.
 */
@Slf4j
@Service
public class AdminPushService {

    /**
     * A notification as the service worker gets it (JSON, see frontend-admin/public/sw.js).
     *
     * @param image relative link to a picture shown large in the notification (Android, Windows); null = none
     * @param group when set, the worker merges this message into an already shown notification
     *              with the same tag instead of replacing it (a run of chat messages)
     */
    public record PushMessage(String title, String body, String url, String tag, Integer badge, boolean urgent,
                              String image, Group group) {

        public PushMessage(String title, String body, String url, String tag, Integer badge, boolean urgent) {
            this(title, body, url, tag, badge, urgent, null, null);
        }
    }

    /** One line of a merged notification: {@code title} without the counter, {@code line} — this message. */
    public record Group(String title, String line) {
    }

    /** Outcome of a send to one or more devices. */
    public record SendResult(int sent, int removed, int failed) {
    }

    /** What the settings screen needs: is push configured, the key to subscribe with, devices. */
    public record PushConfig(boolean enabled, String publicKey, int devices) {
    }

    /** Push services a browser may hand out. Anything else is refused (no SSRF via subscribe). */
    private static final List<String> ALLOWED_HOST_SUFFIXES = List.of(
            "fcm.googleapis.com",          // Chrome, Edge on Android, Samsung Internet, Opera
            "push.apple.com",              // Safari / iOS home-screen apps (web.push.apple.com)
            "push.services.mozilla.com",   // Firefox
            "notify.windows.com");         // Edge on Windows (WNS)

    /** Push services keep an undelivered message this long (device offline / asleep). */
    private static final int TTL_SECONDS = 24 * 60 * 60;
    /** VAPID JWT lifetime; push services reject more than 24 h. */
    private static final long JWT_SECONDS = 12 * 60 * 60;

    private final PushSubscriptionStore store;
    private final PushTransport transport;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor;
    private final Clock clock;

    private final ECPrivateKey privateKey;
    private final byte[] publicKey;
    private final String publicKeyB64;
    private final String subject;

    @Autowired
    public AdminPushService(AppProperties props, PushSubscriptionStore store, PushTransport transport,
                            ObjectMapper objectMapper) {
        this(props, store, transport, objectMapper, Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "admin-push");
            t.setDaemon(true);
            return t;
        }), Clock.systemUTC());
    }

    AdminPushService(AppProperties props, PushSubscriptionStore store, PushTransport transport,
                     ObjectMapper objectMapper, ExecutorService executor, Clock clock) {
        this.store = store;
        this.transport = transport;
        this.objectMapper = objectMapper;
        this.executor = executor;
        this.clock = clock;

        AppProperties.Push cfg = props.getPush();
        String pub = cfg == null ? null : cfg.getVapidPublicKey();
        String priv = cfg == null ? null : cfg.getVapidPrivateKey();
        String sub = cfg == null ? null : cfg.getVapidSubject();
        ECPrivateKey parsedPriv = null;
        byte[] parsedPub = null;
        if (blank(pub) && blank(priv) && blank(sub)) {
            log.info("Admin Web Push is off (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not set)");
        } else if (blank(pub) || blank(priv) || blank(sub)) {
            log.warn("Admin Web Push is off: set all three of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT");
        } else if (!sub.trim().startsWith("mailto:") && !sub.trim().startsWith("https://")) {
            log.warn("Admin Web Push is off: VAPID_SUBJECT must be mailto:… or https://…");
        } else {
            try {
                byte[] pubBytes = WebPushCrypto.b64url(pub);
                ECPublicKey pubKey = WebPushCrypto.publicKey(pubBytes);
                ECPrivateKey privKey = WebPushCrypto.privateKey(WebPushCrypto.b64url(priv));
                if (!WebPushCrypto.matches(privKey, pubKey)) {
                    log.warn("Admin Web Push is off: VAPID_PRIVATE_KEY does not belong to VAPID_PUBLIC_KEY");
                } else {
                    parsedPriv = privKey;
                    parsedPub = pubBytes;
                    log.info("Admin Web Push is on");
                }
            } catch (GeneralSecurityException | IllegalArgumentException e) {
                log.warn("Admin Web Push is off: bad VAPID key ({})", e.getMessage());
            }
        }
        this.privateKey = parsedPriv;
        this.publicKey = parsedPub;
        this.publicKeyB64 = parsedPub == null ? null : WebPushCrypto.b64url(parsedPub);
        this.subject = parsedPriv == null ? null : sub.trim();
    }

    public boolean enabled() {
        return privateKey != null;
    }

    /** «Журнал → Бот и сайт» (optional: tests build the service without it). */
    private com.maxsolch.shop.journal.ActivityLog activity;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setActivity(com.maxsolch.shop.journal.ActivityLog activity) {
        this.activity = activity;
    }

    /** One row per push: the title only (the body may quote a customer's message) and how it went. */
    private void journal(PushMessage message, SendResult r) {
        if (activity == null || r == null) {
            return;
        }
        com.maxsolch.shop.journal.ActivityLog.Entry e = com.maxsolch.shop.journal.ActivityLog.Entry
                .of(com.maxsolch.shop.journal.ActivityLog.SYSTEM, "ADMIN_PUSH")
                .text("Push админам: " + message.title())
                .detail("tag", message.tag())
                .detail("sent", r.sent()).detail("failed", r.failed()).detail("removed", r.removed());
        if (r.sent() == 0 && r.failed() > 0) {
            e.failed("PUSH_FAILED", "не доставлено ни на одно устройство");
        } else if (r.sent() == 0) {
            e.skipped("NO_DEVICES");
        }
        activity.record(e);
    }

    public PushConfig config(long adminId) {
        return new PushConfig(enabled(), publicKeyB64, enabled() ? store.countByAdmin(adminId) : 0);
    }

    // ---- subscriptions ----------------------------------------------------------------------

    public void subscribe(long adminId, String endpoint, String p256dh, String auth, String userAgent) {
        requireEnabled();
        URI uri = validateEndpoint(endpoint);
        try {
            if (WebPushCrypto.b64url(p256dh).length != 65 || WebPushCrypto.b64url(auth).length != 16) {
                throw new BadRequestException("Неверные ключи подписки", "PUSH_BAD_KEYS");
            }
            WebPushCrypto.publicKey(WebPushCrypto.b64url(p256dh));
        } catch (GeneralSecurityException | IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("Неверные ключи подписки", "PUSH_BAD_KEYS");
        }
        String ua = userAgent == null ? null : (userAgent.length() > 255 ? userAgent.substring(0, 255) : userAgent);
        store.upsert(adminId, uri.toString(), p256dh.trim(), auth.trim(), ua);
    }

    public void unsubscribe(String endpoint) {
        if (endpoint != null && !endpoint.isBlank()) {
            store.delete(endpoint.trim());
        }
    }

    /** «Проверить» in the settings: synchronous, to this device (or all of the admin's devices). */
    public SendResult sendTest(long adminId, String endpoint) {
        requireEnabled();
        List<Subscription> targets = endpoint == null || endpoint.isBlank()
                ? store.byAdmin(adminId)
                : store.byEndpoint(endpoint.trim());
        if (targets.isEmpty()) {
            throw new BadRequestException("Это устройство не подписано на уведомления", "PUSH_NOT_SUBSCRIBED");
        }
        return sendTo(targets, new PushMessage("Проверка уведомлений",
                "Уведомления MAXSOLCH Admin работают на этом устройстве", "/settings", "test", null, false));
    }

    // ---- sending ----------------------------------------------------------------------------

    /** Fire-and-forget to every subscribed device; never throws. */
    public void notifyAdmins(PushMessage message) {
        if (!enabled()) {
            return;
        }
        executor.execute(() -> {
            try {
                List<Subscription> subs = store.all();
                if (!subs.isEmpty()) {
                    journal(message, sendTo(subs, message));
                }
            } catch (RuntimeException e) {
                log.warn("Admin push failed: {}", e.toString());
            }
        });
    }

    /** Runs {@code task} on the push thread (the listener loads the order there, off the request). */
    public void runAsync(Runnable task) {
        if (!enabled()) {
            return;
        }
        executor.execute(() -> {
            try {
                task.run();
            } catch (RuntimeException e) {
                log.warn("Admin push task failed: {}", e.toString());
            }
        });
    }

    SendResult sendTo(List<Subscription> subs, PushMessage message) {
        byte[] payload = payload(message);
        int sent = 0;
        int removed = 0;
        int failed = 0;
        for (Subscription s : subs) {
            int status;
            try {
                status = deliver(s, payload, message.urgent());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return new SendResult(sent, removed, failed + 1);
            } catch (Exception e) {
                log.warn("Push to subscription {} failed: {}", s.id(), e.toString());
                store.markFailure(s.id());
                failed++;
                continue;
            }
            if (status >= 200 && status < 300) {
                store.markSuccess(s.id());
                sent++;
            } else if (status == 404 || status == 410) {
                // The browser unsubscribed / the app was removed: forget the device.
                store.deleteById(s.id());
                removed++;
            } else {
                log.warn("Push service answered {} for subscription {}{}", status, s.id(),
                        status == 401 || status == 403 ? " (VAPID keys changed or rejected?)" : "");
                store.markFailure(s.id());
                failed++;
            }
        }
        return new SendResult(sent, removed, failed);
    }

    private int deliver(Subscription s, byte[] payload, boolean urgent) throws Exception {
        URI endpoint = URI.create(s.endpoint());
        byte[] body = WebPushCrypto.encrypt(payload, WebPushCrypto.b64url(s.p256dh()), WebPushCrypto.b64url(s.auth()));
        String audience = endpoint.getScheme() + "://" + endpoint.getHost()
                + (endpoint.getPort() > 0 ? ":" + endpoint.getPort() : "");
        long exp = clock.instant().getEpochSecond() + JWT_SECONDS;
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Authorization", WebPushCrypto.vapidAuthorization(audience, subject, exp, privateKey, publicKey));
        headers.put("Content-Encoding", "aes128gcm");
        headers.put("Content-Type", "application/octet-stream");
        headers.put("TTL", String.valueOf(TTL_SECONDS));
        headers.put("Urgency", urgent ? "high" : "normal");
        return transport.post(endpoint, headers, body);
    }

    byte[] payload(PushMessage m) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("title", cut(m.title(), 80));
        json.put("body", cut(m.body(), 180));
        json.put("url", m.url() == null || !m.url().startsWith("/") ? "/" : m.url());
        if (m.tag() != null) {
            json.put("tag", m.tag());
        }
        if (m.badge() != null) {
            json.put("badge", m.badge());
        }
        if (m.image() != null && m.image().startsWith("/")) {
            json.put("image", m.image());
        }
        if (m.group() != null) {
            json.put("group", Map.of("title", cut(m.group().title(), 80), "line", cut(m.group().line(), 100)));
        }
        try {
            return objectMapper.writeValueAsString(json).getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ---- helpers ----------------------------------------------------------------------------

    private void requireEnabled() {
        if (!enabled()) {
            throw new ConflictException("Push-уведомления выключены на сервере (не заданы VAPID-ключи)", "PUSH_DISABLED");
        }
    }

    static URI validateEndpoint(String endpoint) {
        URI uri;
        try {
            uri = URI.create(endpoint == null ? "" : endpoint.trim());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Неверный адрес подписки", "PUSH_BAD_ENDPOINT");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean allowed = ALLOWED_HOST_SUFFIXES.stream().anyMatch(h -> host.equals(h) || host.endsWith("." + h));
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !allowed || uri.getUserInfo() != null
                || uri.toString().length() > 2048) {
            throw new BadRequestException("Неизвестный push-сервис", "PUSH_BAD_ENDPOINT");
        }
        return uri;
    }

    private static String cut(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
