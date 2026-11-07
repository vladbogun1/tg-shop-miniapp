package com.maxsolch.shop.translation.domain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The checks of one translation against its Russian source that the screen calls «ошибка» (a row with an error is never
 * saved there): empty text, another number of lines, a lost number, changed placeholders, a Latin word of the source
 * missing from the Ukrainian text, a length far from the source, Russian-only letters in Ukrainian. The built-in AI
 * writes on the server without a person looking, so the same rules decide here which translations are written; what the
 * screen only warns about is written and left to «Проверить ИИ». Kept in step with {@code model/check.ts} of the admin.
 */
public final class TranslationAnswerCheck {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{[a-zA-Z0-9]+}");
    private static final Pattern DIGITS = Pattern.compile("\\d+");
    private static final Pattern LATIN = Pattern.compile("[A-Za-z]{3,}");
    private static final Pattern RU_ONLY = Pattern.compile("[ЫыЭэЪъЁё]");
    private static final int SHORT_SOURCE = 15;
    private static final double LONG_FACTOR = 2.5;

    private TranslationAnswerCheck() {
    }

    /** Keeps the model's text but drops outer whitespace the source does not have. */
    public static String normalize(String source, String text) {
        String t = text.replaceAll("\\r\\n?", "\n");
        if (!source.isEmpty() && !Character.isWhitespace(source.charAt(0))) {
            t = t.replaceFirst("^\\s+", "");
        }
        if (!source.isEmpty() && !Character.isWhitespace(source.charAt(source.length() - 1))) {
            t = t.replaceFirst("\\s+$", "");
        }
        return t;
    }

    /** What is wrong with {@code text} as the translation of {@code source} into {@code lang} (uk | en); empty when nothing. */
    public static List<String> errors(String source, String lang, String text) {
        List<String> out = new ArrayList<>();
        if (text == null || text.isBlank()) {
            out.add("пусто");
            return out;
        }
        if (lines(source) != lines(text)) {
            out.add("строк " + lines(text) + ", а в оригинале " + lines(source));
        }
        lostNumbers(source, text, out);
        placeholders(source, text, out);
        if ("uk".equals(lang)) {
            missingLatin(source, text, out);
            if (RU_ONLY.matcher(text).find()) {
                out.add("русские буквы (ы/э/ъ/ё)");
            }
        }
        length(source, lang, text, out);
        return out;
    }

    static int lines(String s) {
        return s.replaceAll("\\s+$", "").split("\n", -1).length;
    }

    private static Map<String, Integer> counts(Pattern p, String s) {
        Map<String, Integer> m = new HashMap<>();
        Matcher mt = p.matcher(s);
        while (mt.find()) {
            m.merge(mt.group(), 1, Integer::sum);
        }
        return m;
    }

    private static void lostNumbers(String source, String text, List<String> out) {
        Map<String, Integer> dst = counts(DIGITS, text);
        Set<String> lost = new LinkedHashSet<>();
        counts(DIGITS, source).forEach((d, n) -> {
            if (dst.getOrDefault(d, 0) < n) {
                lost.add(d);
            }
        });
        if (!lost.isEmpty()) {
            out.add("потеряно число: " + String.join(", ", lost));
        }
    }

    private static void placeholders(String source, String text, List<String> out) {
        Map<String, Integer> src = counts(PLACEHOLDER, source);
        Map<String, Integer> dst = counts(PLACEHOLDER, text);
        Set<String> bad = new LinkedHashSet<>();
        src.forEach((k, n) -> {
            if (!n.equals(dst.get(k))) {
                bad.add(k);
            }
        });
        dst.keySet().stream().filter(k -> !src.containsKey(k)).forEach(bad::add);
        if (!bad.isEmpty()) {
            out.add("плейсхолдеры не совпадают: " + String.join(", ", bad));
        }
    }

    private static void missingLatin(String source, String text, List<String> out) {
        String lower = text.toLowerCase(Locale.ROOT);
        Set<String> missing = new LinkedHashSet<>();
        Matcher m = LATIN.matcher(source);
        while (m.find()) {
            if (!lower.contains(m.group().toLowerCase(Locale.ROOT))) {
                missing.add(m.group());
            }
        }
        if (!missing.isEmpty()) {
            out.add("нет латиницы из оригинала: " + String.join(", ", missing));
        }
    }

    private static void length(String source, String lang, String text, List<String> out) {
        if (source.length() < SHORT_SOURCE) {
            return;
        }
        double r = (double) text.length() / source.length();
        double low = "uk".equals(lang) ? 0.4 : 0.35;
        if (r < low || r > LONG_FACTOR) {
            out.add("длина вне допустимого от оригинала");
        }
    }
}
