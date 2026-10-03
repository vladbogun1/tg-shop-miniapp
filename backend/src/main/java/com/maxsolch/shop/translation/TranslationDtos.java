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
     */
    public record ExportItem(String entityType, String entityId, String field, String source,
                             String sourceHash, String status, String text, String origin) {
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

    public record Counts(int translated, int stale, int missing) {
    }

    /**
     * locale → entity type (+ {@code ALL}) → counts, over the export scope (active non-archived
     * products and their variants, all tags, active payment options; fields with an empty source
     * are not counted).
     */
    public record Stats(Map<String, Map<String, Counts>> locales) {
    }

    public record DeleteResult(int deleted) {
    }
}
