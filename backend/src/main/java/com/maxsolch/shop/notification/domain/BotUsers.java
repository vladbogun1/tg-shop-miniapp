package com.maxsolch.shop.notification.domain;

import com.maxsolch.shop.platform.security.TelegramUser;

/** Who writes to the bot is remembered as a customer; the customers module implements it. */
public interface BotUsers {

    void recordBotUser(TelegramUser user);
}
