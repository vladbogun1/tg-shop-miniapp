package com.maxsolch.shop.platform.i18n;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Set;

/**
 * Text the SHOP sends to a CUSTOMER, in the language that customer reads.
 *
 * <p>Only messages addressed to customers go through here. Everything aimed at the seller — the
 * channel cards, the dispatch list, admin notifications — stays Russian and keeps its literals
 * where they are: the seller reads one language, and a board where every third card is in a
 * different one is harder to work with, not easier.
 *
 * <p>Resolution mirrors the app exactly: the language the customer picked, then what Telegram says
 * about them, then Ukrainian.
 */
@Slf4j
@Component
public class Messages {

    /** The languages the app ships. Anything else falls back. */
    private static final Set<String> SUPPORTED = Set.of("uk", "ru", "en");

    public static final Locale FALLBACK = Locale.forLanguageTag("uk");

    private final MessageSource messageSource;
    private final CustomerLanguages languages;

    public Messages(MessageSource messageSource, CustomerLanguages languages) {
        this.messageSource = messageSource;
        this.languages = languages;
    }

    /** The language to write to this Telegram user in. Never throws, never returns null. */
    public Locale localeOf(Long telegramUserId) {
        if (telegramUserId == null || telegramUserId <= 0) {
            return FALLBACK;
        }
        try {
            return languages.of(telegramUserId)
                    .map(l -> localeOf(l.locale(), l.languageCode()))
                    .orElse(FALLBACK);
        } catch (Exception e) {
            // A notification must never fail because of a lookup for its wording.
            log.debug("locale lookup failed for {}: {}", telegramUserId, e.toString());
            return FALLBACK;
        }
    }

    public Locale localeOf(String locale, String languageCode) {
        Locale picked = normalize(locale);
        return picked != null ? picked : (normalize(languageCode) != null
                ? normalize(languageCode)
                : FALLBACK);
    }

    /**
     * A phrase in the language of the request being handled.
     *
     * <p>This is the one to use from controllers, services and exception handlers: the locale comes
     * from {@code Accept-Language} via {@link LocaleConfig}, so it works on the public endpoints too
     * — and the cart checks a promo code before anyone is authenticated.
     */
    public String current(String key, Object... args) {
        return get(LocaleContextHolder.getLocale(), key, args);
    }

    /** The text of a business error in the language of the request: the bundle entry of its code with its arguments. */
    public String text(com.maxsolch.shop.platform.error.DomainException e) {
        return current(e.errorCode().messageKey(), e.args());
    }

    /** Looks a phrase up; a missing key returns the key itself rather than blowing up a message. */
    public String get(Locale locale, String key, Object... args) {
        try {
            return messageSource.getMessage(key, args, locale);
        } catch (Exception e) {
            log.warn("missing message key '{}' for locale {}", key, locale);
            return key;
        }
    }

    /** Narrows a Telegram language_code ("ru-RU", "uk") to a language we have, or null. */
    public static Locale normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String base = raw.trim().toLowerCase().split("[-_]")[0];
        return SUPPORTED.contains(base) ? Locale.forLanguageTag(base) : null;
    }
}
