package com.maxsolch.shop.staff.app;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * A flush of the admin panel's telemetry queue. There is no admin id here on purpose: who sent it is the token
 * ({@code CurrentActor}); an {@code adminId} in the body is ignored.
 */
public record TelemetryBatch(List<Event> events) {

    /**
     * @param kind       error / freeze / blocked_tap / dead_taps / api_401 (others are dropped)
     * @param path       screen path, uuids already replaced by the panel
     * @param build      build id of the admin app
     * @param ua         short user agent
     * @param standalone opened from the home screen (PWA)
     * @param meta       small JSON object with details (≤ 2 KB stored)
     */
    public record Event(String kind, String path, String build, String ua, Boolean standalone, JsonNode meta) {
    }
}
