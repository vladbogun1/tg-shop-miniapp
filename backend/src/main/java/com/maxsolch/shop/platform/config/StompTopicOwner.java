package com.maxsolch.shop.platform.config;

/**
 * A module's STOMP topic whose subscribers must be its owner (a customer sees only their own thread). The module
 * implements it; {@link WebSocketConfig} asks it when a non-admin subscribes to {@code <prefix><key>[/...]}.
 */
public interface StompTopicOwner {

    /** Destination prefix, e.g. {@code /topic/support/}. */
    String topicPrefix();

    /** Whether {@code userId} owns the entity the {@code key} (the path segment after the prefix) names. */
    boolean isOwner(String key, long userId);
}
