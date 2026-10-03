package com.maxsolch.shop.translation;

import java.util.List;
import java.util.Locale;

/**
 * Content languages. Russian is the source of truth stored in the main tables; only {@code uk} and
 * {@code en} have a translation overlay. Every other value collapses to {@code ru} (= the original),
 * which also keeps catalog cache keys to exactly three values.
 */
public final class ContentLocale {

    public static final String RU = "ru";
    public static final String UK = "uk";
    public static final String EN = "en";

    /** Languages that have translations (and are accepted by the admin import). */
    public static final List<String> TRANSLATED = List.of(UK, EN);

    /** Every content language, source first — what the cross-language search scans. */
    public static final List<String> ALL = List.of(RU, UK, EN);

    private ContentLocale() {
    }

    public static String normalize(Locale locale) {
        return locale == null ? RU : normalize(locale.getLanguage());
    }

    /** "uk", "uk-UA", "EN_gb" → uk / en; anything else (incl. null) → ru. */
    public static String normalize(String lang) {
        if (lang == null) {
            return RU;
        }
        String l = lang.trim().toLowerCase(Locale.ROOT);
        int cut = indexOfSeparator(l);
        if (cut >= 0) {
            l = l.substring(0, cut);
        }
        return TRANSLATED.contains(l) ? l : RU;
    }

    public static boolean isTranslated(String lang) {
        return lang != null && TRANSLATED.contains(lang);
    }

    private static int indexOfSeparator(String s) {
        int dash = s.indexOf('-');
        int underscore = s.indexOf('_');
        if (dash < 0) {
            return underscore;
        }
        return underscore < 0 ? dash : Math.min(dash, underscore);
    }
}
