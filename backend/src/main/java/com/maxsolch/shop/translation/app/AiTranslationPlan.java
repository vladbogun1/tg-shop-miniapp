package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.Status;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationAnswerCheck;
import com.maxsolch.shop.translation.domain.TranslationOrigin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What of the model's answer is written, decided without touching the database (the inputs are the current sources and
 * the stored rows). For every string the prompt asked about (an id is {@code "t"} and the start of the SHA-256 of its
 * Russian text) and every place where that text stands, in each language:
 * <ul>
 *   <li>already translated from the current text: left alone, not counted;</li>
 *   <li>a translation a person wrote (MANUAL) that went stale: never replaced, counted as {@code ignoredLocked};</li>
 *   <li>otherwise written, unless the model did not answer, the id matches no (or several) current texts, or the
 *       translation fails {@link TranslationAnswerCheck}: those are counted as {@code rejected}.</li>
 * </ul>
 * Only the languages the prompt asked for are planned (the admin may translate into one of them); the counts are in
 * places x those languages, as the manual screen counts.
 */
final class AiTranslationPlan {

    /** The items to import per language and the counts of what was not written. */
    record Result(Map<String, List<ImportItem>> items, int rejected, int ignoredLocked) {

        int toWrite() {
            return items.values().stream().mapToInt(List::size).sum();
        }
    }

    private final Map<Key, Field> sources;
    private final Map<String, Map<Key, ContentTranslation>> rows;
    private final Map<String, List<Key>> keysByHash = new HashMap<>();
    private final List<String> locales;

    AiTranslationPlan(Map<Key, Field> sources, Map<String, Map<Key, ContentTranslation>> rows) {
        this(sources, rows, ContentLocale.TRANSLATED);
    }

    /** @param locales the languages to write, of {@link ContentLocale#TRANSLATED} */
    AiTranslationPlan(Map<Key, Field> sources, Map<String, Map<Key, ContentTranslation>> rows, List<String> locales) {
        this.sources = sources;
        this.rows = rows;
        this.locales = locales;
        sources.forEach((key, f) -> {
            if (f.inScope() && !TranslationRows.isBlank(f.text())) {
                keysByHash.computeIfAbsent(SourceHash.sha256Hex(f.text()), h -> new ArrayList<>()).add(key);
            }
        });
    }

    /** @param asked the ids of the prompt; null when it could not be read: then the ids of the answer */
    Result plan(Set<String> asked, Map<String, TranslationAnswerJson.Entry> answers) {
        Map<String, List<ImportItem>> items = new LinkedHashMap<>();
        locales.forEach(l -> items.put(l, new ArrayList<>()));
        int[] counts = new int[2];
        for (String id : asked == null ? answers.keySet() : asked) {
            List<Key> keys = keysOf(id);
            if (keys == null) {
                counts[0]++;
                continue;
            }
            planString(keys, answers.get(id), items, counts);
        }
        return new Result(items, counts[0], counts[1]);
    }

    private void planString(List<Key> keys, TranslationAnswerJson.Entry entry, Map<String, List<ImportItem>> items,
                            int[] counts) {
        for (Key key : keys) {
            String source = sources.get(key).text();
            String hash = SourceHash.sha256Hex(source);
            for (String locale : locales) {
                ContentTranslation row = rows.get(locale).get(key);
                Status status = TranslationReport.statusOf(row, hash);
                if (status == Status.TRANSLATED) {
                    continue;
                }
                if (row != null && row.getOrigin() == TranslationOrigin.MANUAL) {
                    counts[1]++;
                    continue;
                }
                String text = entry == null ? null : "uk".equals(locale) ? entry.uk() : entry.en();
                String clean = text == null ? "" : TranslationAnswerCheck.normalize(source, text);
                if (!TranslationAnswerCheck.errors(source, locale, clean).isEmpty()) {
                    counts[0]++;
                    continue;
                }
                items.get(locale).add(new ImportItem(key.type().name(), key.entityId(), key.field(), hash, clean));
            }
        }
    }

    /** The places of the text the id stands for; null when the id matches no current text or several of them. */
    private List<Key> keysOf(String id) {
        if (id.length() < 2 || id.charAt(0) != 't') {
            return null;
        }
        String prefix = id.substring(1);
        Set<String> hashes = new LinkedHashSet<>();
        keysByHash.keySet().stream().filter(h -> h.startsWith(prefix)).forEach(hashes::add);
        return hashes.size() == 1 ? keysByHash.get(hashes.iterator().next()) : null;
    }
}
