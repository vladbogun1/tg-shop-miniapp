package com.maxsolch.shop.security;

/**
 * Authenticated principal extracted from a JWT.
 */
public record AuthPrincipal(long telegramUserId, Role role) {
}
