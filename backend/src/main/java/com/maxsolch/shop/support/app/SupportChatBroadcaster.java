package com.maxsolch.shop.support.app;

import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/** Pushes a posted support message to {@code /topic/support/{threadId}} once the posting transaction committed. */
@Component
public class SupportChatBroadcaster {

    /** A message was saved in a support thread. */
    public record ChatPosted(byte[] threadId, MessageDto message) {
    }

    private final SimpMessagingTemplate messagingTemplate;

    public SupportChatBroadcaster(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @OnCommitted
    public void on(ChatPosted event) {
        messagingTemplate.convertAndSend("/topic/support/" + UuidUtil.toString(event.threadId()), event.message());
    }
}
