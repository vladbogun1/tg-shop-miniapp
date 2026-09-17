package com.maxsolch.shop.security;

import com.github.benmanes.caffeine.cache.Cache;
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
 * <p>Three buckets, each a fixed window kept in Caffeine (single instance, so in-memory is the
 * right scope — a distributed limiter would need Redis and this deployment has none):
 * <ul>
 *   <li><b>auth</b> — {@value #AUTH_LIMIT} tries per {@value #AUTH_WINDOW_MINUTES} min. The admin
 *       password endpoint had no limit at all, i.e. offline-speed brute force over HTTP.</li>
 *   <li><b>uploads</b> — {@value #UPLOAD_LIMIT}/min, so nobody fills the object store.</li>
 *   <li><b>public reads</b> — {@value #PUBLIC_LIMIT}/min for the unauthenticated catalog and Nova
 *       Poshta endpoints (the bbox one can return 2000 rows per call).</li>
 * </ul>
 *
 * <p>Counting is per client IP. Behind the nginx gateway that means {@code X-Forwarded-For}, which
 * Spring resolves for us because {@code server.forward-headers-strategy=framework} is set.
 */
@Slf4j
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final int AUTH_LIMIT = 10;
    private static final int AUTH_WINDOW_MINUTES = 5;
    private static final int UPLOAD_LIMIT = 30;
    private static final int PUBLIC_LIMIT = 120;
    private static final int ANALYTICS_LIMIT = 20;

    private final Cache<String, AtomicInteger> authAttempts = Caffeine.newBuilder()
            .maximumSize(10_000)
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
        String ip = clientIp(request);

        Bucket bucket = bucketFor(path, request.getMethod());
        if (bucket != null && exceeded(bucket, ip)) {
            log.warn("Rate limit hit: {} {} from {}", request.getMethod(), path, ip);
            reject(response, bucket.retryAfterSeconds);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private Bucket bucketFor(String path, String method) {
        if (path.startsWith("/api/auth/")) {
            return new Bucket(authAttempts, AUTH_LIMIT, AUTH_WINDOW_MINUTES * 60);
        }
        if (path.equals("/api/me/analytics") && "POST".equalsIgnoreCase(method)) {
            // The client flushes on a timer (~4/min) plus on close; this leaves room for a busy
            // session and still caps a client that decided to send an event per tap.
            return new Bucket(analyticsFlushes, ANALYTICS_LIMIT, 60);
        }
        if (path.endsWith("/uploads") && "POST".equalsIgnoreCase(method)) {
            return new Bucket(uploadAttempts, UPLOAD_LIMIT, 60);
        }
        if (path.startsWith("/api/np/") || path.startsWith("/api/products")
                || path.equals("/api/tags") || path.equals("/api/payment-options")
                || path.equals("/api/promo-codes/preview")) {
            return new Bucket(publicReads, PUBLIC_LIMIT, 60);
        }
        return null;
    }

    private boolean exceeded(Bucket bucket, String ip) {
        AtomicInteger counter = bucket.cache.get(ip, k -> new AtomicInteger());
        return counter != null && counter.incrementAndGet() > bucket.limit;
    }

    private void reject(HttpServletResponse response, int retryAfterSeconds) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(
                "{\"status\":429,\"error\":\"Too Many Requests\","
                        + "\"message\":\"Слишком много запросов, попробуйте позже\"}");
    }

    /**
     * Real client address. {@code getRemoteAddr()} already honours X-Forwarded-For thanks to
     * {@code server.forward-headers-strategy=framework}; the explicit header read is a fallback for
     * setups where that is not in play.
     */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        String remote = request.getRemoteAddr();
        return remote == null ? "unknown" : remote;
    }

    private record Bucket(Cache<String, AtomicInteger> cache, int limit, int retryAfterSeconds) {
    }
}
