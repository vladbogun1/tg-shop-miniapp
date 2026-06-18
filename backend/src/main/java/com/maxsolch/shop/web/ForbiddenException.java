package com.maxsolch.shop.web;

/**
 * Maps to HTTP 403.
 */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }
}
