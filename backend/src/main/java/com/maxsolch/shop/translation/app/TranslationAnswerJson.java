package com.maxsolch.shop.translation.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the json blocks of the translation prompt and of the model's answer: an object of ids to
 * {@code { "ru", "uk", "en" }} (the format is fixed by the prompt of the admin, {@code model/prompt.ts}). Ids are
 * case-insensitive, an id that repeats keeps its first value. Only the strings {@code uk} and {@code en} are read: the
 * proofread {@code ru} belongs to the manual screen and is ignored here.
 */
final class TranslationAnswerJson {

    /** One answered string: a language the model did not return is null. */
    record Entry(String uk, String en) {
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern FENCE = Pattern.compile("```[^\\n`]*\\n?([\\s\\S]*?)```");
    private static final Pattern TRAILING_COMMA = Pattern.compile(",(\\s*[}\\]])");

    private TranslationAnswerJson() {
    }

    /** The answers by id; an unreadable block adds nothing. */
    static Map<String, Entry> answers(String text) {
        Map<String, Entry> out = new LinkedHashMap<>();
        for (JsonNode root : objects(text)) {
            root.fields().forEachRemaining(f -> {
                if (f.getValue().isObject()) {
                    out.putIfAbsent(f.getKey().trim().toLowerCase(Locale.ROOT),
                            new Entry(text(f.getValue(), "uk"), text(f.getValue(), "en")));
                }
            });
        }
        return out;
    }

    /** Where the strings start in the prompt of the admin (the instructions above it mention «```json» in a sentence, which breaks the fence pairing). */
    private static final String INPUT_MARKER = "## Строки для перевода";

    /**
     * The line of the prompt that names the languages to translate into ({@code model/prompt.ts} writes it above the
     * strings when the admin works on one language). Only the instructions are searched, not the strings themselves.
     */
    private static final Pattern LOCALES_LINE = Pattern.compile("(?m)^Языки перевода:[ \\t]*([a-z ,]+)\\r?$");

    /**
     * The languages the prompt asked for, of {@code known}, in their order: a prompt without the line (or naming none
     * of them) asks for all of them — the prompts written before the line existed.
     */
    static List<String> locales(String prompt, List<String> known) {
        String head = prompt == null ? "" : prompt;
        int at = head.lastIndexOf(INPUT_MARKER);
        Matcher m = LOCALES_LINE.matcher(at >= 0 ? head.substring(0, at) : head);
        String named = null;
        while (m.find()) {
            named = m.group(1);
        }
        if (named == null) {
            return known;
        }
        Set<String> asked = new LinkedHashSet<>();
        for (String s : named.split(",")) {
            asked.add(s.trim());
        }
        List<String> out = known.stream().filter(asked::contains).toList();
        return out.isEmpty() ? known : out;
    }

    /** The ids the prompt asked about: the keys of its input object (the last block of the prompt); null if unreadable. */
    static Set<String> asked(String prompt) {
        int at = prompt == null ? -1 : prompt.lastIndexOf(INPUT_MARKER);
        List<JsonNode> blocks = objects(at >= 0 ? prompt.substring(at) : prompt);
        if (blocks.isEmpty()) {
            return null;
        }
        Set<String> ids = new LinkedHashSet<>();
        blocks.get(blocks.size() - 1).fieldNames().forEachRemaining(k -> ids.add(k.trim().toLowerCase(Locale.ROOT)));
        return ids;
    }

    private static String text(JsonNode obj, String lang) {
        JsonNode v = obj.get(lang);
        return v != null && v.isTextual() ? v.asText() : null;
    }

    private static List<JsonNode> objects(String text) {
        List<JsonNode> out = new ArrayList<>();
        String t = text == null ? "" : text;
        Matcher m = FENCE.matcher(t);
        boolean any = false;
        while (m.find()) {
            any = true;
            read(m.group(1)).ifPresent(out::add);
        }
        if (!any) {
            read(t.trim()).ifPresent(out::add);
        }
        return out;
    }

    private static Optional<JsonNode> read(String block) {
        try {
            JsonNode n = MAPPER.readTree(TRAILING_COMMA.matcher(block).replaceAll("$1"));
            return n != null && n.isObject() ? Optional.of(n) : Optional.empty();
        } catch (Exception e) {
            return Optional.empty();
        }
    }
}
