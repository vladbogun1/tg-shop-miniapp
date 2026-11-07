package com.maxsolch.shop.ai.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * The state of an AI job and the only allowed moves between states (the table lives here, not in the callers):
 * <pre>
 * QUEUED  -> RUNNING | CANCELED | FAILED
 * RUNNING -> DONE | EMPTY | BAD_ANSWER | FAILED | CANCELED | QUEUED   (QUEUED: the server stopped, the job is given back)
 * </pre>
 * DONE / EMPTY / BAD_ANSWER are the verdicts of the structural check of the answer; none of the end states leaves.
 */
public enum JobStatus {
    QUEUED,
    RUNNING,
    /** The answer reads and has data: waits for the admin's decision. */
    DONE,
    /** The model answered, but there is not a single filled field. */
    EMPTY,
    /** The answer does not read (no JSON block, broken JSON, no block per subject). */
    BAD_ANSWER,
    FAILED,
    CANCELED;

    public boolean active() {
        return this == QUEUED || this == RUNNING;
    }

    public boolean finished() {
        return !active();
    }

    /** The statuses a job may move to from this one. */
    public Set<JobStatus> next() {
        return switch (this) {
            case QUEUED -> EnumSet.of(RUNNING, CANCELED, FAILED);
            case RUNNING -> EnumSet.of(DONE, EMPTY, BAD_ANSWER, FAILED, CANCELED, QUEUED);
            default -> EnumSet.noneOf(JobStatus.class);
        };
    }

    public boolean canMoveTo(JobStatus target) {
        return next().contains(target);
    }
}
