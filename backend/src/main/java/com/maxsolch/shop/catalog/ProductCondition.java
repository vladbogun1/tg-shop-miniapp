package com.maxsolch.shop.catalog;

import java.util.Locale;

/** State of a product (V52); replaces the old «Уценка» tag. Labels are fixed (three values). */
public enum ProductCondition {
    NEW("Новый", "Новий", "New"),
    MARKDOWN("Уценка", "Уцінка", "Markdown"),
    USED("Б/у", "Вживаний", "Used");

    private final String ru;
    private final String uk;
    private final String en;

    ProductCondition(String ru, String uk, String en) {
        this.ru = ru;
        this.uk = uk;
        this.en = en;
    }

    public String label(String lang) {
        return switch (lang == null ? "uk" : lang) {
            case "ru" -> ru;
            case "en" -> en;
            default -> uk;
        };
    }

    public static ProductCondition parse(String s) {
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
