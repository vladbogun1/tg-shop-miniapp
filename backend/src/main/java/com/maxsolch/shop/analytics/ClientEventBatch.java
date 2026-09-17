package com.maxsolch.shop.analytics;

import java.util.List;

/**
 * A flush from one Mini App session.
 *
 * @param sessionId opaque id of the app launch, so a batch can be replayed as a sequence
 * @param events    the buffered events, oldest first
 */
public record ClientEventBatch(String sessionId, List<ClientEventDto> events) {
}
