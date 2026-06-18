package com.maxsolch.shop.security;

/**
 * Thrown when Telegram WebApp initData fails validation (bad signature, expired, malformed).
 */
public class InitDataException extends RuntimeException {

    public InitDataException(String message) {
        super(message);
    }

    public InitDataException(String message, Throwable cause) {
        super(message, cause);
    }
}
