package com.maxsolch.shop.notification.domain;

import org.telegram.telegrambots.meta.api.objects.CallbackQuery;

import java.util.Locale;

/**
 * Something that owns inline-button callbacks the bot receives (the sign-in confirmation, the "block" button under
 * an admin alert). The bot asks each handler whether the callback data is its own; the owning module implements it.
 */
public interface BotCallbackHandler {

    /** Whether this callback data belongs to the handler. */
    boolean handles(String callbackData);

    /** @param locale the language to answer in (the stored choice, else what Telegram reports) */
    void onCallback(CallbackQuery query, Locale locale);

    /** Whether the person behind the button is a shop customer who must be recorded first (not an admin alert). */
    default boolean recordsUser() {
        return true;
    }
}
