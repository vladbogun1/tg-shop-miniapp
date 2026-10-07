package com.maxsolch.shop.common;

/**
 * Small string helpers that used to be copied into every service: blank-to-null for request
 * fields, length caps for columns and notification texts, HTML escaping for Telegram messages.
 */
public final class Texts {

    private Texts() {
    }

    /** {@code null} for null or blank, otherwise the trimmed value. */
    public static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** {@code null} for null or blank, otherwise the value as it is (no trimming). */
    public static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    /** {@code ""} for null, otherwise the value. */
    public static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    /** At most {@code max} characters, cut without a mark (column limits); null stays null. */
    public static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    /** At most {@code max} characters, ending with "…" when shortened (texts people read); null stays null. */
    public static String ellipsize(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    /** Escapes {@code & < >} for Telegram's HTML parse mode; null becomes {@code ""}. */
    public static String escHtml(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
