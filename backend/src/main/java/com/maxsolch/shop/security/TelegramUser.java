package com.maxsolch.shop.security;

/**
 * Telegram user parsed from WebApp initData's {@code user} JSON (or a bot message's {@code from}).
 */
public record TelegramUser(
        long id,
        String username,
        String firstName,
        String lastName,
        String languageCode,
        boolean premium,
        String photoUrl) {

    /** Convenience for callers that only have the basics. */
    public TelegramUser(long id, String username, String firstName, String lastName) {
        this(id, username, firstName, lastName, null, false, null);
    }
}
