package com.maxsolch.shop.catalog;

import java.util.Locale;

/** Work queue state of a product card (V52); does not affect the storefront. */
public enum CardStatus {
    DRAFT, AI_FILLED, READY;

    public static CardStatus parse(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return valueOf(s.trim().toUpperCase(Locale.ROOT).replace('-', '_'));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
