package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

/** The answers of the «ИИ» tab of the metrics (finance right only). Money is in kopecks. */
public final class AiMetricsDtos {

    private AiMetricsDtos() {
    }

    /** The month against its limit: what is spent, the limit (0 = none), a forecast to the month end (an estimate). */
    public record MonthSpend(long spentMinor, long limitMinor, Integer percent,
                             @JsonInclude(NON_NULL) Long forecastMinor, int freeSearchUsed, int freeSearchTotal) {
    }

    /** Built-in against manual: applications of each, and why the manual way was taken (by {@code ManualReason}). */
    public record Share(long builtin, long manual, Integer builtinPercent, Map<String, Long> manualBy) {
    }

    /** Two numbers, never one with two meanings: fields taken as they were, and whole products taken without a change. */
    public record NoEdits(Integer fieldsPercent, Integer cardsPercent, long decided, long notOpened) {
    }

    /** Results waiting for a decision: how many, how old the oldest is (days), how many are over two weeks old. */
    public record Waiting(long count, Integer oldestDays, long stale) {
    }

    /** One line of the money spent in vain; {@code counted} false: shown, but not the fault of the AI. */
    public record WasteRow(String key, long jobs, long costMinor, boolean counted) {
    }

    /** «Применено не глядя»: applied in under 5 seconds, of the results with 10 fields or more. */
    public record FastApply(long count, long of) {
    }

    public record Summary(String from, String to, MonthSpend month, long spentMinor, long accepted,
                          @JsonInclude(NON_NULL) Long perAcceptedMinor, Share share, NoEdits noEdits, Waiting waiting,
                          long wastedMinor, List<WasteRow> waste, FastApply fastApply) {
    }

    /**
     * A line of a breakdown: a day ({@code key} = date), a feature or a provider ({@code kind} = MODEL / SEARCH / PAGE).
     * {@code bad}: jobs (or calls) that went wrong, {@code badMinor}: what they cost.
     */
    public record Row(String key, @JsonInclude(NON_NULL) String kind, long count, long accepted, long bad,
                      long costMinor, long badMinor, long inputTokens, long outputTokens) {
    }

    public record Series(String groupBy, List<Row> rows) {
    }
}
