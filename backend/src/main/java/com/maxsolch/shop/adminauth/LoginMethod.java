package com.maxsolch.shop.adminauth;

/** First factor of an admin sign-in. */
public enum LoginMethod {
    PASSWORD,
    TELEGRAM;

    public String label() {
        return this == PASSWORD ? "пароль" : "Telegram";
    }
}
