package com.maxsolch.shop.ai.domain;

import java.time.Instant;

/**
 * One finished job as the metrics read it: only what the numbers need (the aggregates written when the job ended),
 * never the texts and never the line-by-line journal. The marks of the manual way are facts too (path MANUAL).
 *
 * @param errorCode the reason of a failure; for a manual mark the {@link ManualReason}
 * @param retried   somebody asked again after this job (a job points to it with {@code retry_of})
 */
public record JobFact(long id, AiFeature feature, JobPath path, JobStatus status, String errorCode,
                      long costMicroUsd, int rateMilli, Instant finishedAt, String outcome, int applied, int rejected,
                      int edited, Instant outcomeAt, boolean retried) {

    /** The admin applied at least part of the result. */
    public boolean accepted() {
        return "APPLIED".equals(outcome) || "PARTIAL".equals(outcome);
    }
}
