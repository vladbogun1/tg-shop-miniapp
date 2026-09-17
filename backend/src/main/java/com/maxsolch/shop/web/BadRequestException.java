package com.maxsolch.shop.web;

/**
 * Maps to HTTP 400.
 *
 * <p>Optionally carries a stable {@code code} that the apps can branch on. Matching on the message
 * text would be the alternative, and it breaks the moment the wording is improved or translated —
 * which matters here because these messages are shown to customers in Russian.
 */
public class BadRequestException extends RuntimeException {

    private final String code;

    public BadRequestException(String message) {
        this(message, null);
    }

    public BadRequestException(String message, String code) {
        super(message);
        this.code = code;
    }

    /** Stable identifier of the reason, or null when the message is the whole story. */
    public String getCode() {
        return code;
    }
}
