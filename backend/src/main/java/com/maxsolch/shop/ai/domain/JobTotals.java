package com.maxsolch.shop.ai.domain;

/** What a job cost and did, summed from its lines in {@code ai_usage} when it ends (also when it fails or is stopped). */
public record JobTotals(long costMicroUsd, int rateMilli, TokenUsage tokens, int modelCalls, int searches, int pages,
                        boolean repaired) {

    public static final JobTotals NONE = new JobTotals(0, 0, TokenUsage.NONE, 0, 0, 0, false);

    public JobTotals withRate(int rate) {
        return new JobTotals(costMicroUsd, rate, tokens, modelCalls, searches, pages, repaired);
    }

    public JobTotals withRepaired(boolean value) {
        return new JobTotals(costMicroUsd, rateMilli, tokens, modelCalls, searches, pages, value);
    }
}
