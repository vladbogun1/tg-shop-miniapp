package com.maxsolch.shop.analytics;

import java.util.List;

/**
 * A flush from the public website.
 *
 * @param anonId    random id the browser keeps in localStorage — identifies a visitor before (and
 *                  after) they sign in, so a visit that ends in a login is still one visitor
 * @param sessionId id of the browser tab session
 * @param events    the buffered events, oldest first
 */
public record WebEventBatch(String anonId, String sessionId, List<ClientEventDto> events) {
}
