package com.maxsolch.shop.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.maxsolch.shop.common.ClientIp;
import com.maxsolch.shop.i18n.Messages;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Per-IP request throttling for the endpoints worth abusing.
 *
 * <p>Buckets are fixed windows kept in Caffeine (single instance, so in-memory is the right scope —
 * a distributed limiter would need Redis and this deployment has none):
 * <ul>
 *   <li><b>admin auth</b> — {@code ADMIN_AUTH_RATE_LIMIT} (20) requests per {@value #AUTH_WINDOW_MINUTES}
 *       min for {@code /api/auth/admin/*} (password/Telegram, then the 2FA step). On top of it
 *       {@code AdminLockout} locks an account for 15 min after 5 wrong passwords/codes in a row,
 *       whatever the IP; other {@code /api/auth/*} paths: {@value #AUTH_LIMIT}.</li>
 *   <li><b>admin invite links</b> — {@value #INVITE_LIMIT} per {@value #AUTH_WINDOW_MINUTES} min for
 *       {@code /api/auth/admin/invite/*} (the public /invite page: guessing tokens). The token itself
 *       is 256 random bits and 5 wrong codes revoke an invite; this caps the noise.</li>
 *   <li><b>customer auth</b> — {@value #CUSTOMER_AUTH_LIMIT} per {@value #AUTH_WINDOW_MINUTES} min
 *       for {@code /api/auth/telegram}: every Mini App launch calls it, and customers behind a
 *       mobile carrier's NAT share one address — they used to share the admin's strict bucket.</li>
 *   <li><b>uploads</b> — {@value #UPLOAD_LIMIT}/min, so nobody fills the object store.</li>
 *   <li><b>public reads</b> — {@value #PUBLIC_LIMIT}/min for the unauthenticated catalog and Nova
 *       Poshta endpoints (the bbox one can return 2000 rows per call).</li>
 * </ul>
 *
 * <p>Counting is per client IP as resolved by {@link ClientIp}: the right-most untrusted address of
 * {@code X-Forwarded-For} (Tomcat's RemoteIpValve, {@code server.forward-headers-strategy=native}).
 * The left-most entry used before is whatever the client sent, so a random value per request
 * meant a fresh bucket per request.
 */
@Slf4j
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final Messages messages;
    /** {@code app.security.admin-auth-rate-limit}: a sign-in with 2FA is 2–3 requests. */
    private final int adminAuthLimit;

    public RateLimitFilter(Messages messages, com.maxsolch.shop.config.AppProperties props) {
        this.messages = messages;
        this.adminAuthLimit = Math.max(1, props.getSecurity().getAdminAuthRateLimit());
    }

    private static final int AUTH_LIMIT = 10;
    private static final int AUTH_WINDOW_MINUTES = 5;
    private static final int CUSTOMER_AUTH_LIMIT = 60;
    /** /invite: check + accept + complete is 3 requests; a few retries on a typo. */
    private static final int INVITE_LIMIT = 30;
    private static final int UPLOAD_LIMIT = 30;
    private static final int PUBLIC_LIMIT = 120;
    private static final int ANALYTICS_LIMIT = 20;
    /** Site bot-login starts: each one creates a DB row and a deep link. */
    private static final int WEB_LOGIN_START_LIMIT = 10;
    /** Site status polling (every ~2 s while the login dialog is open) + refresh/complete/logout. */
    private static final int WEB_AUTH_LIMIT = 90;

    private final Cache<String, AtomicInteger> authAttempts = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(AUTH_WINDOW_MINUTES))
            .build();

    private final Cache<String, AtomicInteger> inviteAttempts = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(AUTH_WINDOW_MINUTES))
            .build();

    private final Cache<String, AtomicInteger> customerAuthAttempts = Caffeine.newBuilder()
            .maximumSize(50_000)
            .expireAfterWrite(Duration.ofMinutes(AUTH_WINDOW_MINUTES))
            .build();

    private final Cache<String, AtomicInteger> uploadAttempts = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(1))
            .build();

    private final Cache<String, AtomicInteger> publicReads = Caffeine.newBuilder()
            .maximumSize(50_000)
            .expireAfterWrite(Duration.ofMinutes(1))
            .build();

    private final Cache<String, AtomicInteger> webLoginStarts = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(1))
            .build();

    private final Cache<String, AtomicInteger> webAuthCalls = Caffeine.newBuilder()
            .maximumSize(50_000)
            .expireAfterWrite(Duration.ofMinutes(1))
            .build();

    private final Cache<String, AtomicInteger> analyticsFlushes = Caffeine.newBuilder()
            .maximumSize(50_000)
            .expireAfterWrite(Duration.ofMinutes(1))
            .build();

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        String ip = ClientIp.of(request);

        Bucket bucket = internalCatalogRead(request, path) ? null : bucketFor(path, request.getMethod());
        if (bucket != null && exceeded(bucket, ip)) {
            log.warn("Rate limit hit: {} {} from {}", request.getMethod(), path, ip);
            // This filter runs inside the security chain, long before the DispatcherServlet fills
            // LocaleContextHolder, so the language has to be read off the request by hand.
            reject(response, bucket.retryAfterSeconds, localeOf(request));
            return;
        }
        filterChain.doFilter(request, response);
    }

    private Bucket bucketFor(String path, String method) {
        // The site's bot login has its own buckets: the status poll alone would exhaust the
        // 10-per-5-minutes password bucket in twenty seconds.
        if (path.equals("/api/auth/web/start")) {
            return new Bucket(webLoginStarts, WEB_LOGIN_START_LIMIT, 60);
        }
        if (path.startsWith("/api/auth/web/") && !path.equals("/api/auth/web/dev-login")) {
            return new Bucket(webAuthCalls, WEB_AUTH_LIMIT, 60);
        }
        if (path.equals("/api/auth/telegram")) {
            return new Bucket(customerAuthAttempts, CUSTOMER_AUTH_LIMIT, AUTH_WINDOW_MINUTES * 60);
        }
        if (path.startsWith("/api/auth/admin/invite/")) {
            return new Bucket(inviteAttempts, INVITE_LIMIT, AUTH_WINDOW_MINUTES * 60);
        }
        if (path.startsWith("/api/auth/admin/")) {
            return new Bucket(authAttempts, adminAuthLimit, AUTH_WINDOW_MINUTES * 60);
        }
        if (path.startsWith("/api/auth/")) {
            // Admin password / admin Telegram login (and anything new under /api/auth): strict.
            return new Bucket(authAttempts, AUTH_LIMIT, AUTH_WINDOW_MINUTES * 60);
        }
        if ((path.equals("/api/me/analytics") || path.equals("/api/public/analytics"))
                && "POST".equalsIgnoreCase(method)) {
            // /api/public/analytics is the site's anonymous twin — unauthenticated, so it must be capped too.
            // The client flushes on a timer (~4/min) plus on close; this leaves room for a busy
            // session and still caps a client that decided to send an event per tap.
            return new Bucket(analyticsFlushes, ANALYTICS_LIMIT, 60);
        }
        if ((path.endsWith("/uploads") || path.endsWith("/attachments")) && "POST".equalsIgnoreCase(method)) {
            return new Bucket(uploadAttempts, UPLOAD_LIMIT, 60);
        }
        if (path.startsWith("/api/np/") || path.startsWith("/api/products") || path.startsWith("/api/public/")
                || path.equals("/api/tags") || path.equals("/api/payment-options")
                || path.equals("/api/promo-codes/preview")) {
            return new Bucket(publicReads, PUBLIC_LIMIT, 60);
        }
        return null;
    }

    /**
     * The site's server-side rendering reads the catalog straight from the backend over the compose
     * network — every visitor's page render arrives from the one site container, which would hit
     * the per-IP public limit within seconds. Such a request has no X-Forwarded-For (the gateways
     * always add one for outside traffic) and comes from a private/loopback address.
     */
    private static boolean internalCatalogRead(HttpServletRequest request, String path) {
        if (!path.startsWith("/api/public/") || request.getHeader("X-Forwarded-For") != null) {
            return false;
        }
        try {
            java.net.InetAddress addr = java.net.InetAddress.getByName(request.getRemoteAddr());
            return addr.isLoopbackAddress() || addr.isSiteLocalAddress();
        } catch (Exception e) {
            return false;
        }
    }

    private boolean exceeded(Bucket bucket, String ip) {
        AtomicInteger counter = bucket.cache.get(ip, k -> new AtomicInteger());
        return counter != null && counter.incrementAndGet() > bucket.limit;
    }

    /** First supported language in Accept-Language, or the fallback. */
    private static java.util.Locale localeOf(HttpServletRequest request) {
        String header = request.getHeader("Accept-Language");
        if (header != null) {
            for (String part : header.split(",")) {
                java.util.Locale candidate = Messages.normalize(part.split(";")[0].trim());
                if (candidate != null) {
                    return candidate;
                }
            }
        }
        return Messages.FALLBACK;
    }

    private void reject(HttpServletResponse response, int retryAfterSeconds, java.util.Locale locale)
            throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(
                "{\"status\":429,\"error\":\"Too Many Requests\","
                        + "\"message\":\"" + messages.get(locale, "api.error.rateLimited") + "\"}");
    }

    private record Bucket(Cache<String, AtomicInteger> cache, int limit, int retryAfterSeconds) {
    }
}
