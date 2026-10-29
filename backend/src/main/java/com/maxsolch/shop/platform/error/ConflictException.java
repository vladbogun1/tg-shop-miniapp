package com.maxsolch.shop.platform.error;

import java.util.Map;

/**
 * Maps to HTTP 409: the request was valid, but the data it was based on changed in the meantime.
 * Carries a stable code the apps can branch on, e.g. STOCK_CONFLICT.
 *
 * @deprecated use {@link DomainException.Conflict} with an {@link ErrorCode}.
 */
@Deprecated(forRemoval = true)
public class ConflictException extends DomainException.Conflict {

    /** Generic "data changed under you" code (lock timeouts, optimistic-lock failures). */
    public static final String CONFLICT = "CONFLICT";

    public ConflictException(String message) {
        this(message, CONFLICT);
    }

    public ConflictException(String message, String code) {
        this(message, code, Map.of());
    }

    public ConflictException(String message, String code, Map<String, Object> details) {
        super(message, code == null ? null : ErrorCode.of(code), details);
    }
}
