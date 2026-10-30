package com.maxsolch.shop.platform.web;

import com.maxsolch.shop.platform.tx.OnCommitted;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Pushes {@link TopicMessagePosted} to its STOMP topic once the posting transaction has committed, so a subscriber
 * never sees a message that a rollback then erases.
 */
@Component
public class TopicBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;

    public TopicBroadcaster(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @OnCommitted
    public void on(TopicMessagePosted event) {
        messagingTemplate.convertAndSend(event.destination(), event.payload());
    }
}
