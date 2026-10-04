package com.maxsolch.shop.web;

/**
 * Maps to HTTP 409: the request was valid, but the data it was based on changed in the meantime
 * (e.g. a product's stock moved while the admin had the edit form open).
 *
 * <p>Carries a stable {@code code} (e.g. {@code STOCK_CONFLICT}) the admin UI branches on.
 */
public class ConflictException extends RuntimeException {

    private final String code;

    public ConflictException(String message, String code) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
