package com.maxsolch.shop.platform.i18n;

import java.util.Optional;

/**
 * The language a customer picked (and the one Telegram reported) — what {@link Messages} needs to word a message for
 * him. The customers live in {@code customer}; it implements this port, so {@code platform} does not depend on it.
 */
public interface CustomerLanguages {

    record Languages(String locale, String languageCode) {
    }

    Optional<Languages> of(long telegramUserId);
}
