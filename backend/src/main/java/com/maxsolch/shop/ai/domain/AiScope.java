package com.maxsolch.shop.ai.domain;

/**
 * What an external call is made for: the feature (metrics, settings) and, when it belongs to a background job, the job
 * and the admin who started it — so every line of {@code ai_usage} can be summed per job and per admin. A call without
 * a job (the «check search» button) has {@code jobId} and {@code adminId} null.
 */
public record AiScope(AiFeature feature, Long jobId, Long adminId) {

    public static AiScope of(AiFeature feature) {
        return new AiScope(feature, null, null);
    }

    public static AiScope job(AiFeature feature, long jobId, long adminId) {
        return new AiScope(feature, jobId, adminId);
    }
}
