package com.maxsolch.shop.platform.http;

import java.time.Duration;

/**
 * How one outgoing HTTP client behaves. Timeouts are mandatory (a call without a deadline holds a thread
 * forever when the other side hangs); retries are bounded and apply to idempotent requests only.
 *
 * @param name           client name for logs and for {@code app.http.clients.<name>.*} overrides
 * @param connectTimeout time to establish the connection
 * @param requestTimeout time to the full response; applied to every request that does not set its own timeout
 * @param maxRetries     extra attempts after the first for idempotent requests (0..{@value #MAX_RETRIES_LIMIT})
 * @param retryBackoff   pause before retry n is {@code retryBackoff * n}
 */
public record HttpClientSettings(String name, Duration connectTimeout, Duration requestTimeout,
                                 int maxRetries, Duration retryBackoff) {

    public static final int MAX_RETRIES_LIMIT = 3;

    public HttpClientSettings {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("http client name is required");
        }
        requirePositive(connectTimeout, "connectTimeout");
        requirePositive(requestTimeout, "requestTimeout");
        if (maxRetries < 0 || maxRetries > MAX_RETRIES_LIMIT) {
            throw new IllegalArgumentException("maxRetries must be 0.." + MAX_RETRIES_LIMIT + ", got " + maxRetries);
        }
        if (retryBackoff == null || retryBackoff.isNegative()) {
            throw new IllegalArgumentException("retryBackoff must not be negative");
        }
    }

    /** Conservative defaults: 3 s to connect, 10 s per request, no retries. */
    public static HttpClientSettings defaults(String name) {
        return new HttpClientSettings(name, Duration.ofSeconds(3), Duration.ofSeconds(10), 0, Duration.ofMillis(300));
    }

    public HttpClientSettings withTimeouts(Duration connect, Duration request) {
        return new HttpClientSettings(name, connect, request, maxRetries, retryBackoff);
    }

    public HttpClientSettings withRetries(int retries, Duration backoff) {
        return new HttpClientSettings(name, connectTimeout, requestTimeout, retries, backoff);
    }

    private static void requirePositive(Duration d, String field) {
        if (d == null || d.isZero() || d.isNegative()) {
            throw new IllegalArgumentException(field + " must be positive");
        }
    }
}
