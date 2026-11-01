package com.maxsolch.shop.platform.i18n;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * The one list of languages the shop speaks to a customer.
 *
 * <p>Every place that used to spell {@code "uk"/"ru"/"en"} — message bundles, bot texts, broadcast
 * labels, catalog labels, site cache prefixes — takes the list, the default and the order of
 * fallbacks from here. A {@code switch} over this enum has no {@code default}, so the compiler names
 * every spot that needs a text when a language is added. The same list lives on the fronts in
 * {@code packages/core/src/i18n.ts}; {@code scripts/check-locales-sync.mjs} compares them.
 */
public enum AppLocale {

    /** Ukrainian: the language of the site by default and the fallback for everything unknown. */
    UK("uk"),
    /** Russian: the source language of the catalog content and of the seller's side. */
    RU("ru"),
    EN("en");

    public static final AppLocale DEFAULT = UK;

    /** The language the content in the main tables is written in; the others are translations. */
    public static final AppLocale CONTENT_SOURCE = RU;

    private final String code;
    private final Locale javaLocale;

    AppLocale(String code) {
        this.code = code;
        this.javaLocale = Locale.forLanguageTag(code);
    }

    public String code() {
        return code;
    }

    public Locale javaLocale() {
        return javaLocale;
    }

    /** URL prefix of the site for this language: none for the default one, {@code "/ru"} otherwise. */
    public String sitePrefix() {
        return this == DEFAULT ? "" : "/" + code;
    }

    /** Language codes in declaration order — what a bundle, a setting or a loop is made over. */
    public static List<String> codes() {
        return Arrays.stream(values()).map(AppLocale::code).toList();
    }

    /** The Java locales in declaration order, for the resolver of {@code Accept-Language}. */
    public static List<Locale> javaLocales() {
        return Arrays.stream(values()).map(AppLocale::javaLocale).toList();
    }

    /** "ru", "ru-RU", "EN_gb" → the language, or null for anything we do not speak. Never throws. */
    public static AppLocale parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String base = raw.trim().toLowerCase(Locale.ROOT).split("[-_]")[0];
        for (AppLocale l : values()) {
            if (l.code.equals(base)) {
                return l;
            }
        }
        return null;
    }

    /** Like {@link #parse} but never null: an unknown or missing language is {@link #DEFAULT}. */
    public static AppLocale parseOrDefault(String raw) {
        AppLocale l = parse(raw);
        return l == null ? DEFAULT : l;
    }
}
