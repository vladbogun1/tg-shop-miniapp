package com.maxsolch.shop.common;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Real client address, for rate limits, login logs and site sessions.
 *
 * <p>This is {@code getRemoteAddr()}, which Tomcat's RemoteIpValve
 * ({@code server.forward-headers-strategy=native}) has already resolved: it walks
 * {@code X-Forwarded-For} from the right, skipping our own proxies (private / loopback addresses —
 * the gateways, Caddy, the host's edge proxy reaching a container), and takes the first address it
 * does not trust. That is the address the outermost proxy actually saw.
 *
 * <p>It used to be the LEFT-most {@code X-Forwarded-For} entry, read straight from the header — and
 * that one is whatever the client chose to send: nginx's {@code $proxy_add_x_forwarded_for} only
 * appends to it. A different made-up value per request meant a fresh rate-limit bucket per request.
 */
public final class ClientIp {

    private ClientIp() {
    }

    public static String of(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }
}
