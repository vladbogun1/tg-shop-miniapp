package com.maxsolch.shop.translation.domain;

import com.maxsolch.shop.platform.i18n.AppLocale;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * Content languages. Russian is the source of truth stored in the main tables; only {@code uk} and
 * {@code en} have a translation overlay. Every other value collapses to {@code ru} (= the original),
 * which also keeps catalog cache keys to exactly three values.
 */
public final class ContentLocale {

    public static final String RU = AppLocale.CONTENT_SOURCE.code();
    /** Named for the fixed label_uk / label_en columns, which stage 2 of the language list removes. */
    public static final String UK = AppLocale.UK.code();
    public static final String EN = AppLocale.EN.code();

    /** Languages that have translations (and are accepted by the admin import). */
    public static final List<String> TRANSLATED = Arrays.stream(AppLocale.values())
            .filter(l -> l != AppLocale.CONTENT_SOURCE).map(AppLocale::code).toList();

    /** Every content language, source first — what the cross-language search scans. */
    public static final List<String> ALL = Stream.concat(Stream.of(RU), TRANSLATED.stream()).toList();

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
