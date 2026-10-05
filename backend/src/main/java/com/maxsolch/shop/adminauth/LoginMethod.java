package com.maxsolch.shop.adminauth;

/** First factor of an admin sign-in. */
public enum LoginMethod {
    PASSWORD,
    TELEGRAM,
    /** The /invite link: login + password set right there, then the code (stage 2). */
    INVITE;

    public String label() {
        return switch (this) {
            case PASSWORD -> "пароль";
            case TELEGRAM -> "Telegram";
            case INVITE -> "приглашение";
        };
    }
}
