package com.maxsolch.shop.support.app;

import com.maxsolch.shop.platform.config.StompTopicOwner;
import org.springframework.stereotype.Component;

/** {@code /topic/support/{threadId}}: only the thread's customer (admins are let in by the platform). */
@Component
public class SupportTopicOwner implements StompTopicOwner {

    private final SupportService support;

    public SupportTopicOwner(SupportService support) {
        this.support = support;
    }

    @Override
    public String topicPrefix() {
        return "/topic/support/";
    }

    @Override
    public boolean isOwner(String key, long userId) {
        return support.isOwner(key, userId);
    }
}
