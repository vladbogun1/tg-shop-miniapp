package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;

import java.time.Instant;

/**
 * A job as the admin screens get it. The first block is for every admin; the second — the money, the tokens and the
 * prompt, and the provider's error text — only for an admin with the finance right: for the others the server sends none of it (the fields are
 * absent, not hidden by the screen). The answer is part of the work of whoever started the job, so every admin gets it.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AiJobDto(
        long id, AiFeature feature, JobStatus status, long adminId, String subjectType, String subjectId,
        String subjectVersion, JobMode mode, String effort, int researchItems, Long retryOf, boolean cancelRequested,
        int attempts, String errorCode, String errorNote, String outcome, Instant createdAt, Instant startedAt,
        Instant finishedAt, String answer,
        // finance only
        String prompt, Long costMicroUsd, Long costMinor, Integer rateMilli, Integer inputTokens, Integer cachedTokens,
        Integer outputTokens, Integer modelCalls, Integer searches, Integer pages, Boolean repaired,
        String promptVersion) {

    /** The texts of a job; absent in list rows. */
    public record Body(String prompt, String answer) {
    }

    /** @param body prompt and answer; null for a list row (no texts) */
    static AiJobDto of(AiJob j, Body body, boolean finance) {
        return new AiJobDto(j.getId(), j.getFeature(), j.getStatus(), j.getAdminId(), j.getSubjectType(),
                j.getSubjectId(), j.getSubjectVersion(), j.getMode(), j.getEffort(), j.getResearchItems(),
                j.getRetryOf(), j.isCancelRequested(), j.getAttempts(), j.getErrorCode(), finance ? j.getErrorNote() : null,
                j.getOutcome(), j.getCreatedAt(), j.getStartedAt(), j.getFinishedAt(),
                body == null ? null : body.answer(),
                finance && body != null ? body.prompt() : null,
                finance ? j.getCostMicroUsd() : null,
                finance ? AiMoney.costMinor(j.getCostMicroUsd(), j.getRateMilli()) : null,
                finance ? j.getRateMilli() : null, finance ? j.getInputTokens() : null,
                finance ? j.getCachedTokens() : null, finance ? j.getOutputTokens() : null,
                finance ? j.getModelCalls() : null, finance ? j.getSearches() : null, finance ? j.getPages() : null,
                finance ? j.isRepaired() : null, finance ? j.getPromptVersion() : null);
    }
}
