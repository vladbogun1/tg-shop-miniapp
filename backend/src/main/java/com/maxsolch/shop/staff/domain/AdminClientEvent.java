package com.maxsolch.shop.staff.domain;

import java.time.Instant;
import java.util.Set;

/**
 * One row of the admin panel's own telemetry ({@code admin_client_events}, V99): what went wrong on an admin's device —
 * a JS error, a stalled main thread, a tap into an invisible layer, taps with no reaction, a 401/403 of the admin API.
 * Not a customer event: it never feeds the shop metrics.
 *
 * @param id        row id ({@code null} before insert)
 * @param adminId   Telegram id of the admin — always from the token, never from the request body
 * @param kind      one of {@link #KINDS}
 * @param path      screen path ({@code ?tab=} only, uuids as {@code <id>})
 * @param build     build id of the admin app
 * @param ua        short user agent
 * @param standalone installed to the home screen (PWA) rather than a browser tab
 * @param metaJson  small JSON object with details, already valid JSON (or {@code null})
 */
public record AdminClientEvent(Long id, long adminId, String kind, String path, String build, String ua,
                               boolean standalone, String metaJson, Instant createdAt) {

    /** Kinds the panel sends; anything else is dropped. Breadcrumbs ({@code nav}) travel inside {@code meta.trail}. */
    public static final Set<String> KINDS = Set.of("error", "freeze", "blocked_tap", "dead_taps", "api_401");

    public static final int PATH_MAX = 200;
    public static final int BUILD_MAX = 40;
    public static final int UA_MAX = 160;

    /** {@code s} cut to {@code max} characters; blank → {@code null}. */
    public static String cap(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.strip();
        return t.length() <= max ? t : t.substring(0, max);
    }
}
