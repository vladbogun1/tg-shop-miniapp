package com.maxsolch.shop.web;

/**
 * Maps to HTTP 429 with a stable {@code code} (e.g. {@code ORDER_COOLDOWN}) and, when known, a
 * {@code Retry-After} header — a business limit (anti-bot), not the per-IP filter.
 */
public class TooManyRequestsException extends RuntimeException {

    private final String code;
    private final long retryAfterSeconds;

    public TooManyRequestsException(String message, String code, long retryAfterSeconds) {
        super(message);
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public String getCode() {
        return code;
    }

    /** Seconds until the limit lets the next request through; 0 = unknown. */
    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
