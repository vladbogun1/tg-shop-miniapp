package com.maxsolch.shop.promo.domain;

/** Why a personal or expired code cannot be used (V44); each one knows the customer-facing phrase for the cart preview. */
public enum PromoRejection {
    EXPIRED("api.promo.expired"),
    SIGN_IN("api.promo.personalSignIn"),
    /** Somebody else's personal code: the same answer as for a code that does not exist. */
    NOT_FOUND("api.promo.notFound");

    private final String messageKey;

    PromoRejection(String messageKey) {
        this.messageKey = messageKey;
    }

    public String messageKey() {
        return messageKey;
    }
}
