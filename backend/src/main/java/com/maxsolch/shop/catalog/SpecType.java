package com.maxsolch.shop.catalog;

import java.util.Locale;

/** Type of a characteristic; JSON uses the lower-case name. */
public enum SpecType {
    NUMBER, ENUM, MULTI, BOOL, TEXT;

    public String json() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Case-insensitive; null for blank/unknown. */
    public static SpecType parse(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
