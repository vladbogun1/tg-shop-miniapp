package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslationDtos.Status;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * What the auto-translation still has to translate into one language, decided without touching the database or the
 * translator: every live field with a Russian text whose translation is missing or was made from an older text, unless
 * a person wrote it (MANUAL is never replaced), its type is skipped, or this very text already came back unusable.
 * Fields with the same Russian text are one item: it is sent (and billed) once. Shortest texts first, so titles and
 * names get through even when a long description has to wait for the next run.
 */
final class AutoTranslationPlan {

    /** One Russian text to translate and every place it stands in. */
    record Item(String source, String hash, List<Key> keys) {
    }

    private AutoTranslationPlan() {
    }

    static List<Item> pending(Map<Key, Field> sources, Map<Key, ContentTranslation> rows,
                              Set<TranslationEntityType> skipTypes, Predicate<String> unusable) {
        Map<String, Item> byHash = new LinkedHashMap<>();
        sources.forEach((key, f) -> {
            if (!wanted(key, f, skipTypes)) {
                return;
            }
            String hash = SourceHash.sha256Hex(f.text());
            ContentTranslation row = rows.get(key);
            if (TranslationReport.statusOf(row, hash) == Status.TRANSLATED || unusable.test(hash)) {
                return;
            }
            if (row != null && row.getOrigin() == TranslationOrigin.MANUAL) {
                return;
            }
            byHash.computeIfAbsent(hash, h -> new Item(f.text(), h, new ArrayList<>())).keys().add(key);
        });
        List<Item> out = new ArrayList<>(byHash.values());
        out.sort(Comparator.comparingInt((Item i) -> i.source().length()).thenComparing(Item::hash));
        return out;
    }

    private static boolean wanted(Key key, Field f, Set<TranslationEntityType> skipTypes) {
        return f.inScope() && !TranslationRows.isBlank(f.text()) && !skipTypes.contains(key.type())
                && f.text().length() <= TranslationLimits.MAX_TEXT_CHARS;
    }

    /**
     * The items to send now: in order, while the characters fit {@code budget}; then cut into calls of at most
     * {@code maxTexts} texts and {@code maxChars} characters.
     */
    static List<List<Item>> calls(List<Item> pending, long budget, int maxTexts, int maxChars) {
        List<List<Item>> out = new ArrayList<>();
        List<Item> call = new ArrayList<>();
        long spent = 0;
        int callChars = 0;
        for (Item item : pending) {
            int len = item.source().length();
            if (spent + len > budget) {
                break;
            }
            if (!call.isEmpty() && (call.size() >= maxTexts || callChars + len > maxChars)) {
                out.add(call);
                call = new ArrayList<>();
                callChars = 0;
            }
            call.add(item);
            callChars += len;
            spent += len;
        }
        if (!call.isEmpty()) {
            out.add(call);
        }
        return out;
    }

    static long chars(List<Item> items) {
        return items.stream().mapToLong(i -> i.source().length()).sum();
    }
}
