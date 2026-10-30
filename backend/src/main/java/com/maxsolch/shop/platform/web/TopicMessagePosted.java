package com.maxsolch.shop.platform.web;

/**
 * A message was saved and must reach the subscribers of a STOMP topic once the transaction has committed
 * (see {@link TopicBroadcaster}). The publisher builds the destination and the payload, so the platform knows
 * nothing about chats.
 *
 * @param destination topic, e.g. {@code /topic/support/{threadId}}
 * @param payload     what the subscribers receive (serialised to JSON)
 */
public record TopicMessagePosted(String destination, Object payload) {
}
