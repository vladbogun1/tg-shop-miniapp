package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;

import java.time.Instant;
import java.util.List;

import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

/**
 * A job as the admin screens get it. The first block is for every admin; the second — the money, the tokens and the
 * prompt, and the provider's error text — only for an admin with the finance right: for the others the server sends none of it (the fields are
 * absent, not hidden by the screen). The answer is part of the work of whoever started the job, so every admin gets it.
 */
public record AiJobDto(
        long id, AiFeature feature, JobStatus status, long adminId, String subjectType, String subjectId,
        String subjectVersion, JobMode mode, String effort, int researchItems, Long retryOf, boolean cancelRequested,
        int attempts, String errorCode, @JsonInclude(NON_NULL) String errorNote, String outcome, Instant createdAt, Instant startedAt,
        Instant finishedAt, @JsonInclude(NON_NULL) String answer,
        // finance only: the keys are left out of the reply for the others
        @JsonInclude(NON_NULL) String prompt, @JsonInclude(NON_NULL) Long costMicroUsd,
        @JsonInclude(NON_NULL) Long costMinor, @JsonInclude(NON_NULL) Integer rateMilli,
        @JsonInclude(NON_NULL) Integer inputTokens, @JsonInclude(NON_NULL) Integer cachedTokens,
        @JsonInclude(NON_NULL) Integer outputTokens, @JsonInclude(NON_NULL) Integer modelCalls,
        @JsonInclude(NON_NULL) Integer searches, @JsonInclude(NON_NULL) Integer pages,
        @JsonInclude(NON_NULL) Boolean repaired, @JsonInclude(NON_NULL) String promptVersion,
        // what a running job is doing now («Ищу: …»); absent when it does not run
        @JsonInclude(NON_NULL) String step,
        // the review of a finished job: fields changed since the start and who edited the object; absent in list rows
        @JsonInclude(NON_NULL) SubjectChanges subjectChanges) {

    /** The texts of a job; absent in list rows. */
    public record Body(String prompt, String answer) {
    }

    /** A field that differs from the snapshot taken at the start; values in the form of the subject's port. */
    public record Change(String key, String before, String after) {
    }

    /** Somebody who changed the object after the start, with the time of their last change. */
    public record Editor(String name, Instant at) {
    }

    /** @param editors newest first; the journal names who edited the object, not which field */
    public record SubjectChanges(List<Change> fields, List<Editor> editors) {
    }

    /** @param body prompt and answer; null for a list row (no texts) */
    static AiJobDto of(AiJob j, Body body, boolean finance) {
        return of(j, body, finance, null);
    }

    static AiJobDto of(AiJob j, Body body, boolean finance, SubjectChanges changes) {
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
                finance ? j.isRepaired() : null, finance ? j.getPromptVersion() : null, j.currentStep(), changes);
    }
}
