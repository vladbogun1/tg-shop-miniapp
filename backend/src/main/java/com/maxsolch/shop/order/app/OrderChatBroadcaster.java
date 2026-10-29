package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Pushes a posted chat message to the order's STOMP topic once the posting transaction has committed,
 * so a subscriber never sees a message that a rollback then erases.
 */
@Component
public class OrderChatBroadcaster {

    /** A message was saved in the order chat. */
    public record ChatPosted(byte[] orderId, MessageDto message) {
    }

    private final SimpMessagingTemplate messagingTemplate;

    public OrderChatBroadcaster(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @OnCommitted
    public void on(ChatPosted event) {
        messagingTemplate.convertAndSend("/topic/orders/" + UuidUtil.toString(event.orderId()) + "/chat",
                event.message());
    }
}
