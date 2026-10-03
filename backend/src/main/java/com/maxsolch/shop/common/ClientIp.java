package com.maxsolch.shop.common;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Real client address. {@code getRemoteAddr()} already honours X-Forwarded-For thanks to
 * {@code server.forward-headers-strategy=framework}; the explicit header read is a fallback for
 * setups where that is not in play.
 */
public final class ClientIp {

    private ClientIp() {
    }

    public static String of(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        String remote = request.getRemoteAddr();
        return remote == null ? "unknown" : remote;
    }
}
