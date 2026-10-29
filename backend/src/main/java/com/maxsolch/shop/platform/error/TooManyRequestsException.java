package com.maxsolch.shop.platform.error;

/**
 * Maps to HTTP 429 with a stable code (e.g. ORDER_COOLDOWN) and, when known, a Retry-After header:
 * a business limit (anti-bot), not the per-IP filter.
 *
 * @deprecated use {@link DomainException.TooManyRequests} with an {@link ErrorCode}.
 */
@Deprecated(forRemoval = true)
public class TooManyRequestsException extends DomainException.TooManyRequests {

    public TooManyRequestsException(String message, String code, long retryAfterSeconds) {
        super(message, code == null ? null : ErrorCode.of(code), retryAfterSeconds);
    }
}
