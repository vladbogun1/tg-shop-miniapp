package com.maxsolch.shop.i18n;

import java.util.Locale;

/**
 * The one-line preview of a chat message that has no text (a photo, a file).
 *
 * <p>Previews are built once and reused: the seller's channel and push, the admin conversation list
 * and {@code support_threads.last_preview} all read the Russian {@link #PHOTO} / {@link #FILE}. The
 * customer must not see those — {@link #localize} swaps exactly these placeholders for the
 * customer's language on the way out (their order inbox, support list, bot DM). Anything else is
 * what a person wrote, or a file name, and passes through untouched.
 */
public final class ChatPreview {

    public static final String PHOTO = "📷 Фото";
    public static final String FILE = "📎 Файл";

    private ChatPreview() {
    }

    public static String localize(String preview, Locale locale, Messages messages) {
        if (preview == null) {
            return null;
        }
        if (preview.equals(PHOTO)) {
            return messages.get(locale, "api.chat.photo");
        }
        if (preview.equals(FILE)) {
            return messages.get(locale, "api.chat.file");
        }
        return preview;
    }

    /** Same, in the language of the current request. */
    public static String current(String preview, Messages messages) {
        return localize(preview, org.springframework.context.i18n.LocaleContextHolder.getLocale(), messages);
    }
}
