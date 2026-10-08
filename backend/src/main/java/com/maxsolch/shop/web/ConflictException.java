package com.maxsolch.shop.web;

/**
 * Maps to HTTP 409: the request was valid, but the data it was based on changed in the meantime
 * (someone else saved first). Carries a stable {@code code} the apps can branch on — e.g.
 * {@code STOCK_CONFLICT} for a product saved over a stock figure that is no longer current.
 */
public class ConflictException extends RuntimeException {

    /** Generic "data changed under you" code (lock timeouts, optimistic-lock failures). */
    public static final String CONFLICT = "CONFLICT";

    private final String code;
    /** Extra fields merged into the error body (e.g. {@code count}, {@code missing}); never null. */
    private final java.util.Map<String, Object> details;

    public ConflictException(String message) {
        this(message, CONFLICT);
    }

    public ConflictException(String message, String code) {
        this(message, code, java.util.Map.of());
    }

    public ConflictException(String message, String code, java.util.Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = details == null ? java.util.Map.of() : details;
    }

    public java.util.Map<String, Object> getDetails() {
        return details;
    }

    /** Stable identifier of the reason. */
    public String getCode() {
        return code;
    }
}
