package com.maxsolch.shop.security;

/**
 * Telegram user parsed from WebApp initData's {@code user} JSON.
 */
public record TelegramUser(long id, String username, String firstName, String lastName) {
}
