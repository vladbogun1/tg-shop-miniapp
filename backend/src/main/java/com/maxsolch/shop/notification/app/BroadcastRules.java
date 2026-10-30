package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.i18n.Messages;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** The language rules of a broadcast ({@link BroadcastService}): who reads which text. Pure, unit-tested. */
final class BroadcastRules {

    private BroadcastRules() {
    }

    /** One message to send: chat id + language that picks the text variant. */
    record Recipient(long id, String lang) {
    }

    static final Map<String, String> DEFAULT_BUTTON = Map.of(
            "uk", "🛍 Відкрити магазин",
            "ru", "🛍 Открыть магазин",
            "en", "🛍 Open the shop");

    /** Shop choice first, then the Telegram language, then the shop fallback (Ukrainian). */
    static String langOf(String locale, String languageCode) {
        Locale picked = Messages.normalize(locale);
        if (picked == null) {
            picked = Messages.normalize(languageCode);
        }
        return (picked == null ? Messages.FALLBACK : picked).getLanguage();
    }

    /** Audience ids → recipients with their language, narrowed to {@code lang} when given. */
    static List<Recipient> recipients(List<Long> ids, Map<Long, String> langs, String lang) {
        List<Recipient> out = new ArrayList<>(ids.size());
        for (Long id : ids) {
            String l = langs.getOrDefault(id, Messages.FALLBACK.getLanguage());
            if (lang == null || lang.equals(l)) {
                out.add(new Recipient(id, l));
            }
        }
        return out;
    }

    /** The version written for the recipient's language, else the main text. */
    static String textFor(String lang, String text, String uk, String ru, String en) {
        String v = switch (lang == null ? "" : lang) {
            case "uk" -> uk;
            case "ru" -> ru;
            case "en" -> en;
            default -> null;
        };
        return v == null || v.isBlank() ? text : v;
    }

    static String normLang(String lang) {
        if (lang == null || lang.isBlank()) {
            return null;
        }
        String l = lang.trim().toLowerCase(Locale.ROOT);
        return DEFAULT_BUTTON.containsKey(l) ? l : null;
    }
}
