package com.maxsolch.shop.i18n;

import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.MessageSource;
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
    private final UserRepository userRepository;

    public Messages(MessageSource messageSource, UserRepository userRepository) {
        this.messageSource = messageSource;
        this.userRepository = userRepository;
    }

    /** The language to write to this Telegram user in. Never throws, never returns null. */
    public Locale localeOf(Long telegramUserId) {
        if (telegramUserId == null || telegramUserId <= 0) {
            return FALLBACK;
        }
        try {
            return userRepository.findById(telegramUserId)
                    .map(this::localeOf)
                    .orElse(FALLBACK);
        } catch (Exception e) {
            // A notification must never fail because of a lookup for its wording.
            log.debug("locale lookup failed for {}: {}", telegramUserId, e.toString());
            return FALLBACK;
        }
    }

    public Locale localeOf(User user) {
        Locale picked = normalize(user.getLocale());
        return picked != null ? picked : (normalize(user.getLanguageCode()) != null
                ? normalize(user.getLanguageCode())
                : FALLBACK);
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
