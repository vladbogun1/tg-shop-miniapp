package com.maxsolch.shop.notification.domain;

import java.util.Locale;

/** {@code /start login_<nonce>} in a private chat: the website login the person is confirming in the bot. */
public interface BotLoginStarter {

    void onStartLogin(long chatId, String nonce, Locale locale);
}
