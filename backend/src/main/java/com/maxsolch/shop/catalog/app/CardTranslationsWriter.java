package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardIssue;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.translation.app.StoredTranslations;
import com.maxsolch.shop.translation.app.TranslationLimits;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The uk/en part of a card import ({@link CardsImporter}): writes the PRODUCT translations of the item's resulting
 * Russian sources. Runs inside the importer's transaction.
 */
final class CardTranslationsWriter {

    private final StoredTranslations translations;
    private final Clock clock;

    CardTranslationsWriter(StoredTranslations translations, Clock clock) {
        this.translations = translations;
        this.clock = clock;
    }

    /** Translations written for one item: per locale, how many were kept as MANUAL, and whether any was written. */
    record Written(Map<String, Integer> perLocale, int skippedManual, boolean any) {
    }

    /** Context of the translations of one language of one item. */
    private record Tr(String pid, Product p, String locale, int[] counts, List<CardIssue> issues,
                      Map<String, Object[]> changes, boolean manual, Long adminId) {
    }

    /** Translations of the resulting Russian sources; a changed text is recorded in {@code textChanges}. */
    Written write(String pid, Product p, CardImportItem item, List<CardIssue> issues,
                  Map<String, Object[]> textChanges, boolean manual, Long adminId) {
        Map<String, Integer> translated = new LinkedHashMap<>();
        int skippedManual = 0;
        boolean any = false;
        if (item.translations() == null) {
            return new Written(translated, skippedManual, any);
        }
        for (Map.Entry<String, CardTranslation> e : item.translations().entrySet()) {
            String locale = e.getKey() == null ? "" : e.getKey().trim().toLowerCase(Locale.ROOT);
            if (!ContentLocale.TRANSLATED.contains(locale) || e.getValue() == null) {
                issues.add(new CardIssue(pid, "translations." + e.getKey(), "INVALID_LOCALE",
                        "язык перевода: uk или en"));
                continue;
            }
            CardTranslation t = e.getValue();
            Tr tr = new Tr(pid, p, locale, new int[]{0, 0}, issues, textChanges, manual, adminId);
            writeTranslation(tr, TranslationEntityType.TITLE, p.getTitle(), t.title());
            writeTranslation(tr, TranslationEntityType.DESCRIPTION, p.getDescription(), t.description());
            writeTranslation(tr, TranslationEntityType.CONDITION_NOTE, p.getConditionNote(), t.conditionNote());
            translated.put(locale, tr.counts()[0]);
            skippedManual += tr.counts()[1];
            any |= tr.counts()[0] > 0;
        }
        return new Written(translated, skippedManual, any);
    }

    /**
     * Writes one PRODUCT translation of the current Russian {@code source} (hash of the source as
     * stored). From the AI MANUAL rows are kept; the admin's edit ({@code manual}) is written as
     * MANUAL over anything. counts[0] = written, counts[1] = skipped as MANUAL; a changed text is
     * recorded in {@code changes} for card_meta.last.
     */
    private void writeTranslation(Tr tr, String field, String source, String text) {
        if (text == null) {
            return;
        }
        String key = "translations." + tr.locale() + "." + field;
        if (text.isBlank()) {
            tr.issues().add(new CardIssue(tr.pid(), key, "INVALID_TEXT_BLANK", "пустой перевод"));
            return;
        }
        if (text.length() > TranslationLimits.MAX_TEXT_CHARS
                || text.getBytes(StandardCharsets.UTF_8).length > 65_535) {
            tr.issues().add(new CardIssue(tr.pid(), key, "INVALID_TEXT_TOO_LONG", "перевод слишком длинный"));
            return;
        }
        if (source == null || source.isBlank()) {
            tr.issues().add(new CardIssue(tr.pid(), key, "NO_SOURCE", "нет русского текста для перевода"));
            return;
        }
        StoredTranslations.Stored row = translations
                .find(TranslationEntityType.PRODUCT, tr.p().getId(), field, tr.locale()).orElse(null);
        if (row != null && row.origin() == TranslationOrigin.MANUAL && !tr.manual()) {
            tr.counts()[1]++;
            return;
        }
        String before = row == null ? null : row.text();
        // An admin's accepted text is reviewed; new AI text goes back to «Проверить ИИ» on the «Переводы» screen.
        translations.write(TranslationEntityType.PRODUCT, tr.p().getId(), field, tr.locale(), text, source,
                tr.manual() ? TranslationOrigin.MANUAL : TranslationOrigin.AI,
                tr.manual() ? clock.instant() : null, tr.adminId());
        tr.counts()[0]++;
        if (!text.equals(before)) {
            tr.changes().put(tr.locale() + "/" + CardsService.textKey(field), new Object[]{before, text});
        }
    }
}
