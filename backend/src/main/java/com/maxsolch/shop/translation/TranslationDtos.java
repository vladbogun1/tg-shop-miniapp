package com.maxsolch.shop.translation;

import java.util.List;
import java.util.Map;

/** Request/response shapes of {@code /api/admin/translations}. */
public final class TranslationDtos {

    private TranslationDtos() {
    }

    /** Status of one field in one language. */
    public enum Status {
        /** A translation exists and was made from the current Russian source. */
        TRANSLATED,
        /** A translation exists, but the Russian source changed since (it is not shown). */
        STALE,
        /** No translation. */
        MISSING
    }

    /**
     * One translatable field. {@code text}/{@code origin} are null when {@code status = MISSING};
     * for STALE they hold the outdated translation (useful as a starting point).
     * {@code productId}/{@code productTitle}: the product a PRODUCT or VARIANT field belongs to
     * (link to its editor and context for variant names); null for payment options and tag names.
     * For the SEO fields of a TAG {@code productTitle} holds the category name (context only,
     * {@code productId} stays null).
     * {@code prevSource}: for STALE — the Russian text the translation was made from (V56), so the
     * screen can show what changed; null when unknown or not stale.
     * {@code reviewed}: a person accepted the text (MANUAL rows always; AI rows after «Принять»).
     */
    public record ExportItem(String entityType, String entityId, String field, String source,
                             String sourceHash, String status, String text, String origin,
                             String productId, String productTitle, String prevSource, boolean reviewed) {
    }

    public record ImportItem(String entityType, String entityId, String field, String sourceHash, String text) {
    }

    /** {@code origin}: AI (default) | MANUAL. {@code force}: overwrite MANUAL rows too. */
    public record ImportRequest(String locale, String origin, Boolean force, List<ImportItem> items) {
    }

    /** reason: INVALID_* | NOT_FOUND | NO_SOURCE | STALE | MANUAL. */
    public record Rejected(String entityType, String entityId, String field, String reason) {
    }

    public record ImportResult(int applied, int skippedStale, int skippedManual, int notFound, int invalid,
                               List<Rejected> rejected) {
    }

    /** {@code unreviewed}: part of {@code translated} that is AI output nobody accepted yet. */
    public record Counts(int translated, int stale, int missing, int unreviewed) {
    }

    /**
     * locale → entity type (+ {@code ALL}) → counts of fields, over the export scope (active
     * non-archived products and their variants, categories, active payment options, chat templates;
     * fields with an empty source are not counted).
     *
     * <p>{@code texts}: the same work in the units of the «Переводы» screen — unique Russian texts
     * (a description shared by 20 products is one), each in exactly one bucket, first match wins:
     * {@code missing} (some language has no translation) → {@code stale} (the original changed) →
     * {@code review} (AI translation not accepted yet) → {@code done}.
     */
    public record Stats(Map<String, Map<String, Counts>> locales, TextCounts texts) {
    }

    public record TextCounts(int missing, int stale, int review, int done) {
    }

    /**
     * «Принять»: the translation of {@code locale} is correct for the source with {@code sourceHash}
     * (the hash the admin saw — must be the current one). A stale row is re-bound to that source.
     */
    public record AcceptItem(String entityType, String entityId, String field, String locale, String sourceHash) {
    }

    public record AcceptRequest(List<AcceptItem> items) {
    }

    /**
     * {@code accepted}: rows marked reviewed ({@code rebased} of them were stale and now belong to the
     * current source); {@code skippedStale}: the source changed after the admin looked;
     * {@code notFound}: no translation / no such field.
     */
    public record AcceptResult(int accepted, int rebased, int skippedStale, int notFound, int invalid) {
    }

    public record DeleteResult(int deleted) {
    }

    /** One field whose Russian source is being corrected; {@code sourceHash} = hash the admin saw. */
    public record SourceRef(String entityType, String entityId, String field, String sourceHash) {
    }

    /**
     * Proofreading fix of the Russian source (typos found by the AI during translation) together with
     * the translations of the NEW source, applied in one transaction so they are never stale.
     * {@code items}: every field that holds the same source text (shared descriptions);
     * {@code translations}: locale (uk|en) → translated text, both optional.
     */
    public record SourceFixRequest(List<SourceRef> items, String source, Map<String, String> translations) {
    }

    /**
     * {@code updated}: fields whose source was replaced; {@code skippedStale}: the source changed
     * since the admin saw it (nothing written for that field); {@code translationsApplied}: rows
     * written (fields × locales); {@code sourceHash}: hash of the new source.
     */
    public record SourceFixResult(int updated, int skippedStale, int notFound, int invalid,
                                  int translationsApplied, String sourceHash, List<Rejected> rejected) {
    }
}
