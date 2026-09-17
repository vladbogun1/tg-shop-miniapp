package com.maxsolch.shop.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Single source of truth for which browser origins may talk to this backend — used by both the
 * CORS configuration and the STOMP/SockJS handshake, which previously disagreed (CORS had a
 * curated list, the WebSocket endpoint accepted {@code "*"}).
 *
 * <p>Localhost and tunnel wildcards (ngrok / cloudflared) are development conveniences and are only
 * added under the {@code dev} profile. In production the list is exactly the two configured app
 * URLs, so a random site cannot drive the API with a victim's credentials.
 */
@Slf4j
@Component
public class AllowedOrigins {

    private static final List<String> DEV_PATTERNS = List.of(
            "http://localhost:*",
            "http://127.0.0.1:*",
            "https://*.ngrok-free.app",
            "https://*.ngrok-free.dev",
            "https://*.trycloudflare.com");

    private final List<String> patterns;

    public AllowedOrigins(AppProperties props, Environment environment) {
        List<String> list = new ArrayList<>();
        addIfSet(list, props.getWebappBaseUrl());
        addIfSet(list, props.getAdminBaseUrl());

        boolean dev = false;
        for (String profile : environment.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(profile) || "local".equalsIgnoreCase(profile)) {
                dev = true;
                break;
            }
        }
        if (dev) {
            list.addAll(DEV_PATTERNS);
        }
        if (list.isEmpty()) {
            // Nothing configured at all: refuse everything rather than silently allowing "*".
            log.warn("No allowed origins configured (WEBAPP_BASE_URL / ADMIN_BASE_URL are empty) "
                    + "— cross-origin browser calls will be rejected.");
        }
        this.patterns = List.copyOf(list);
        log.info("Allowed browser origins: {}", this.patterns);
    }

    public List<String> patterns() {
        return patterns;
    }

    /** Same list as an array, for APIs that take varargs (SockJS/STOMP endpoint registration). */
    public String[] patternsArray() {
        return patterns.toArray(new String[0]);
    }

    private static void addIfSet(List<String> target, String value) {
        if (value != null && !value.isBlank() && !target.contains(value.trim())) {
            target.add(value.trim());
        }
    }
}
