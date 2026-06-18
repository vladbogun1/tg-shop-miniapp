package com.maxsolch.shop.web;

/** Maps to HTTP 401 (bad credentials / not authenticated). */
public class UnauthorizedException extends RuntimeException {
    public UnauthorizedException(String message) {
        super(message);
    }
}
