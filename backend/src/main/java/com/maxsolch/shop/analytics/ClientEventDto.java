package com.maxsolch.shop.analytics;

import java.time.Instant;

/**
 * One buffered event as the Mini App sends it.
 *
 * @param event      what happened: click / view / error / …
 * @param target     what it happened to (a {@code data-analytics} name, or role + label)
 * @param path       the route it happened on
 * @param meta       free-form details, already serialised by the client
 * @param clientTime device clock; the server keeps its own {@code created_at} as well, because a
 *                   phone with a wrong clock must not be able to bury events in the past
 */
public record ClientEventDto(String event,
                             String target,
                             String path,
                             String meta,
                             Instant clientTime) {
}
