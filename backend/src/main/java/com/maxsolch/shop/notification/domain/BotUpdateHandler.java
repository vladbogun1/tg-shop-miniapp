package com.maxsolch.shop.notification.domain;

import org.telegram.telegrambots.meta.api.objects.Update;

/** What the bot does with an update it received; the long-polling adapter ({@code ShopBot}) only hands them over. */
public interface BotUpdateHandler {

    /** Never throws: a failing update must not stop the polling loop. */
    void onUpdate(Update update);
}
