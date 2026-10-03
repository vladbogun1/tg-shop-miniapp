package com.maxsolch.shop.domain;

/** Lifecycle of a "log in to the site via the bot" request ({@code web_login_tokens.status}). */
public enum WebLoginStatus {
    /** Created by the browser, waiting for the user to pick the number in the bot. */
    PENDING,
    /** The right number was picked in the bot; the browser may now complete the login. */
    CONFIRMED,
    /** Wrong number or "it's not me" — one attempt only. */
    REJECTED,
    /** The browser completed the login (a session was created). Never usable again. */
    USED,
    /** Timed out before being used. */
    EXPIRED
}
