package com.maxsolch.shop.catalog.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Разбор ответа ИИ по карточке: достаём JSON-блок, чиним типичные огрехи (висячие запятые, «умные» кавычки,
 * оборванный ответ) и собираем {@link CardDraft} по ключу товара. То же, что {@code parse.ts} + {@code review-parts.ts}
 * в frontend-admin/features/cards/model, но без проверки значений по схеме (её делает импорт карточек): неверный
 * тип поля пропускается, мусор не роняет разбор.
 */
final class CardAnswerParser {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern FENCE = Pattern.compile("```[^\\n`]*\\n?([\\s\\S]*?)```");
    private static final Pattern PRODUCT_START = Pattern.compile(",\\s*\"p[0-9a-f]{6,32}\"\\s*:\\s*\\{", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTTP = Pattern.compile("^https?://\\S+$", Pattern.CASE_INSENSITIVE);
    private static final int MAX_PHOTOS = 8;

    private CardAnswerParser() {
    }

    static Optional<CardDraft> parse(String answer, String key, CardAnswerParser.CategoryLookup categories) {
        if (answer == null || answer.isBlank() || key == null || key.isBlank()) {
            return Optional.empty();
        }
        String text = answer.replace("﻿", "").replaceAll("\\r\\n?", "\n");
        for (String block : candidateBlocks(text)) {
            JsonNode root = tryParse(block);
            JsonNode entry = root == null ? null : entryOf(root, key);
            if (entry != null && entry.isObject()) {
                return Optional.of(draftOf(entry, categories));
            }
        }
        return Optional.empty();
    }

    /** Id категории-листа по slug; null — нет такой или не лист. */
    interface CategoryLookup {
        String leafIdBySlug(String slug);
    }

    // ---------------------------------------------------------------- JSON block

    private static List<String> candidateBlocks(String text) {
        List<String> blocks = new ArrayList<>();
        Matcher m = FENCE.matcher(text);
        while (m.find()) {
            if (m.group(1).contains("{")) {
                blocks.add(m.group(1));
            }
        }
        if (!blocks.isEmpty()) {
            return blocks;
        }
        int open = text.indexOf("```");
        String body = open >= 0 ? text.substring(text.indexOf('\n', open) + 1) : text;
        int a = body.indexOf('{');
        int b = body.lastIndexOf('}');
        if (a >= 0 && open >= 0) {
            blocks.add(body.substring(a));
        } else if (a >= 0 && b > a) {
            blocks.add(body.substring(a, b + 1));
        }
        return blocks;
    }

    private static JsonNode tryParse(String block) {
        List<String> attempts = new ArrayList<>();
        attempts.add(block);
        attempts.add(noCommas(block));
        attempts.add(noCommas(smartQuotes(block)));
        String cut = cutToLastProduct(block);
        if (cut != null) {
            attempts.add(noCommas(smartQuotes(cut)));
        }
        for (String a : attempts) {
            try {
                JsonNode n = JSON.readTree(a);
                if (n != null && n.isObject()) {
                    return n;
                }
            } catch (Exception ignored) {
                // next attempt
            }
        }
        return null;
    }

    private static String noCommas(String s) {
        return s.replaceAll(",(\\s*[}\\]])", "$1");
    }

    private static String smartQuotes(String s) {
        return s.replaceAll("[“”„‟″]", "\"");
    }

    /** Ответ оборван посреди товара: отбрасываем недописанный и закрываем объект. */
    private static String cutToLastProduct(String block) {
        Matcher m = PRODUCT_START.matcher(block);
        int last = -1;
        while (m.find()) {
            last = m.start();
        }
        return last < 0 ? null : block.substring(0, last) + "\n}";
    }

    /** Запись товара: точный ключ (без учёта регистра) или единственный ключ-префикс/продолжение (ИИ мог сократить id). */
    private static JsonNode entryOf(JsonNode root, String key) {
        String want = key.trim().toLowerCase(Locale.ROOT);
        JsonNode prefixHit = null;
        int hits = 0;
        for (Map.Entry<String, JsonNode> e : root.properties()) {
            String k = e.getKey().trim().toLowerCase(Locale.ROOT);
            if (k.equals(want)) {
                return e.getValue();
            }
            if (k.length() >= 7 && (k.startsWith(want) || want.startsWith(k))) {
                prefixHit = e.getValue();
                hits++;
            }
        }
        return hits == 1 ? prefixHit : null;
    }

    // ---------------------------------------------------------------- fields

    private static CardDraft draftOf(JsonNode e, CategoryLookup categories) {
        String slug = firstText(e, "category", "categorySlug");
        String brand = text(e.get("brand"));
        if (brand != null && brand.length() > 128) {
            brand = null;
        }
        Map<String, Object> specs = specsOf(e.get("specs"));
        return new CardDraft(slug, slug == null ? null : categories.leafIdBySlug(slug), brand, specs,
                confidenceOf(e.get("confidence")), percent(e.get("overall")),
                langTexts(e.get("title")), langTexts(e.get("description")), nullIfEmpty(langTexts(firstNode(e, "conditionNote", "condition_note"))),
                links(e.get("sources"), Integer.MAX_VALUE), links(firstNode(e, "photos", "images"), MAX_PHOTOS),
                fieldSources(firstNode(e, "field_sources", "fieldSources")), text(e.get("notes")));
    }

    private static Map<String, Object> specsOf(JsonNode n) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (n == null || !n.isObject()) {
            return out;
        }
        for (Map.Entry<String, JsonNode> e : n.properties()) {
            JsonNode v = e.getValue();
            String k = e.getKey().trim();
            if (k.isEmpty() || v == null || v.isNull() || (v.isTextual() && v.asText().isEmpty())) {
                continue;
            }
            out.put(k, JSON.convertValue(v, Object.class));
        }
        return out;
    }

    private static Map<String, Integer> confidenceOf(JsonNode n) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (n == null || !n.isObject()) {
            return out;
        }
        for (Map.Entry<String, JsonNode> e : n.properties()) {
            Integer p = percent(e.getValue());
            if (p != null) {
                out.put(e.getKey().trim(), p);
            }
        }
        return out;
    }

    /** Уверенность: 0..1 с дробной частью — доли, иначе проценты; приводится к 0..100; не число — null. */
    static Integer percent(JsonNode n) {
        Double v = looseNumber(n);
        if (v == null) {
            return null;
        }
        boolean hasDot = n.isNumber() ? v != Math.rint(v) : n.asText().contains(".");
        long pct = v > 0 && v <= 1 && hasDot ? Math.round(v * 100) : Math.round(v);
        return (int) Math.max(0, Math.min(100, pct));
    }

    private static Double looseNumber(JsonNode n) {
        if (n == null) {
            return null;
        }
        if (n.isNumber()) {
            return n.asDouble();
        }
        if (n.isTextual()) {
            try {
                return Double.parseDouble(n.asText().trim().replace("%", "").replace(',', '.').trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /** Текст товара: строка = только ru; объект — ru/uk(ua)/en; пустые языки отбрасываются. */
    private static Map<String, String> langTexts(JsonNode n) {
        Map<String, String> out = new LinkedHashMap<>();
        if (n == null) {
            return out;
        }
        if (n.isTextual()) {
            putText(out, "ru", n.asText());
        } else if (n.isObject()) {
            for (Map.Entry<String, JsonNode> e : n.properties()) {
                String l = e.getKey().trim().toLowerCase(Locale.ROOT);
                String lang = l.equals("ua") ? "uk" : l;
                if ((lang.equals("ru") || lang.equals("uk") || lang.equals("en")) && e.getValue().isTextual()) {
                    putText(out, lang, e.getValue().asText());
                }
            }
        }
        return out;
    }

    private static void putText(Map<String, String> out, String lang, String raw) {
        String t = raw.replaceAll("\\r\\n?", "\n").strip();
        if (!t.isEmpty()) {
            out.put(lang, t);
        }
    }

    private static List<String> links(JsonNode n, int max) {
        List<String> out = new ArrayList<>();
        if (n == null) {
            return out;
        }
        List<JsonNode> items = new ArrayList<>();
        if (n.isArray()) {
            n.forEach(items::add);
        } else {
            items.add(n);
        }
        for (JsonNode it : items) {
            String s = it.isTextual() ? it.asText().strip() : it.isObject() ? text(it.get("url")) : null;
            if (s != null && HTTP.matcher(s).matches() && !out.contains(s) && out.size() < max) {
                out.add(s);
            }
        }
        return out;
    }

    private static Map<String, String> fieldSources(JsonNode n) {
        Map<String, String> out = new LinkedHashMap<>();
        if (n == null || !n.isObject()) {
            return out;
        }
        for (Map.Entry<String, JsonNode> e : n.properties()) {
            String v = e.getValue().isTextual() ? e.getValue().asText().strip() : null;
            if (v != null && HTTP.matcher(v).matches()) {
                out.put(e.getKey().trim(), v);
            }
        }
        return out;
    }

    private static JsonNode firstNode(JsonNode e, String... names) {
        for (String name : names) {
            JsonNode v = e.get(name);
            if (v != null && !v.isNull()) {
                return v;
            }
        }
        return null;
    }

    private static String firstText(JsonNode e, String... names) {
        for (String name : names) {
            String t = text(e.get(name));
            if (t != null) {
                return t;
            }
        }
        return null;
    }

    private static String text(JsonNode n) {
        if (n == null || !n.isTextual()) {
            return null;
        }
        String s = n.asText().strip();
        return s.isEmpty() ? null : s;
    }

    private static Map<String, String> nullIfEmpty(Map<String, String> m) {
        return m.isEmpty() ? null : m;
    }
}
