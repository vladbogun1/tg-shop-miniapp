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

    public ConflictException(String message) {
        this(message, CONFLICT);
    }

    public ConflictException(String message, String code) {
        super(message);
        this.code = code;
    }

    /** Stable identifier of the reason. */
    public String getCode() {
        return code;
    }
}
