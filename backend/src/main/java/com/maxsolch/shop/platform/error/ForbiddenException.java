package com.maxsolch.shop.platform.error;

/**
 * Maps to HTTP 403.
 */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }
}
