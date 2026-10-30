package com.maxsolch.shop.platform.security;

/** Recognises an admin pre-auth token (password passed, 2FA not yet), which is never a principal. */
public interface PreAuthTokenCheck {

    boolean looksLikePreAuth(String token);
}
