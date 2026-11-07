package com.maxsolch.shop.ai.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.Instant;

/**
 * One AI task (V87): who started it, for which object, how it stands and what it cost. The only source of truth —
 * any backend instance may take it, and a restart loses nothing. The status changes only through the methods here
 * and only along {@link JobStatus#next()}; the costs are written once, when the job ends.
 *
 * <p>The column {@code active_key} (a database-generated unique key over the active jobs) is not mapped: the database
 * itself refuses a second active job for the same object.
 */
@Getter
@Entity
@Table(name = "ai_jobs")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiJob {

    /** What the creator decides; everything else is fixed by the job itself. */
    public record Spec(AiFeature feature, long adminId, String subjectType, String subjectId, String subjectVersion,
                       JobMode mode, String effort, int researchItems, String promptVersion, String idemKey,
                       Long retryOf, Long batchId) {

        public Spec(AiFeature feature, long adminId, String subjectType, String subjectId, String subjectVersion,
                    JobMode mode, String effort, int researchItems, String promptVersion, String idemKey,
                    Long retryOf) {
            this(feature, adminId, subjectType, subjectId, subjectVersion, mode, effort, researchItems, promptVersion,
                    idemKey, retryOf, null);
        }
    }

    /** What the admin did with the result: counts of fields, as the review screen reports them. */
    public record Outcome(int applied, int rejected, int edited, int ignoredLocked) {

        public String verdict() {
            if (applied == 0) {
                return "REJECTED";
            }
            return rejected == 0 && ignoredLocked == 0 ? "APPLIED" : "PARTIAL";
        }
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "feature", nullable = false, length = 32)
    private AiFeature feature;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private JobStatus status;

    @Column(name = "admin_id", nullable = false)
    private long adminId;

    @Column(name = "subject_type", nullable = false, length = 24)
    private String subjectType;

    @Column(name = "subject_id", nullable = false, length = 64)
    private String subjectId;

    @Column(name = "subject_version", length = 64)
    private String subjectVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false, length = 12)
    private JobMode mode;

    @Column(name = "effort", nullable = false, length = 8)
    private String effort;

    @Column(name = "research_items", nullable = false)
    private int researchItems;

    @Column(name = "prompt_version", length = 32)
    private String promptVersion;

    @Column(name = "idem_key", length = 64)
    private String idemKey;

    @Column(name = "retry_of")
    private Long retryOf;

    /** The batch this job belongs to (V90); null for a single task. */
    @Column(name = "batch_id")
    private Long batchId;

    @Column(name = "cancel_requested", nullable = false)
    private boolean cancelRequested;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Enumerated(EnumType.STRING)
    @Column(name = "path", nullable = false, length = 12)
    private JobPath path = JobPath.BUILTIN;

    @Column(name = "cost_micro_usd", nullable = false)
    private long costMicroUsd;

    @Column(name = "rate_milli", nullable = false)
    private int rateMilli;

    @Column(name = "input_tokens", nullable = false)
    private int inputTokens;

    @Column(name = "cached_tokens", nullable = false)
    private int cachedTokens;

    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;

    @Column(name = "model_calls", nullable = false)
    private int modelCalls;

    @Column(name = "searches", nullable = false)
    private int searches;

    @Column(name = "pages", nullable = false)
    private int pages;

    @Column(name = "repaired", nullable = false)
    private boolean repaired;

    @Column(name = "error_code", length = 40)
    private String errorCode;

    @Column(name = "error_note", length = 255)
    private String errorNote;

    @Column(name = "outcome", length = 16)
    private String outcome;

    @Column(name = "outcome_applied")
    private Integer outcomeApplied;

    @Column(name = "outcome_rejected")
    private Integer outcomeRejected;

    @Column(name = "outcome_edited")
    private Integer outcomeEdited;

    @Column(name = "outcome_ignored")
    private Integer outcomeIgnored;

    @Column(name = "outcome_at")
    private Instant outcomeAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "heartbeat_at")
    private Instant heartbeatAt;

    @Column(name = "deadline_at")
    private Instant deadlineAt;

    @Column(name = "locked_by", length = 64)
    private String lockedBy;

    /** What a running job is doing now (V92): written only by {@code AiJobRepository.step}, never by the entity. */
    @Column(name = "step", length = 160, insertable = false, updatable = false)
    private String step;

    @Column(name = "step_at", insertable = false, updatable = false)
    private Instant stepAt;

    public static AiJob queued(Spec spec, Instant now) {
        AiJob j = new AiJob();
        j.feature = spec.feature();
        j.status = JobStatus.QUEUED;
        j.adminId = spec.adminId();
        j.subjectType = spec.subjectType();
        j.subjectId = spec.subjectId();
        j.subjectVersion = spec.subjectVersion();
        j.mode = spec.mode();
        j.effort = spec.effort();
        j.researchItems = spec.researchItems();
        j.promptVersion = spec.promptVersion();
        j.idemKey = spec.idemKey();
        j.retryOf = spec.retryOf();
        j.batchId = spec.batchId();
        j.createdAt = now;
        return j;
    }

    /**
     * A mark that the admin did a result by hand (the manual way through ChatGPT) and applied it: not a task of the AI,
     * no money, already finished with the outcome APPLIED. It exists so the metrics can tell the share of the built-in
     * way from the manual one. The reason goes to {@code error_code}.
     */
    public static AiJob manualMark(AiFeature feature, long adminId, String subjectType, String subjectId,
                                   ManualReason reason, Instant now) {
        AiJob j = new AiJob();
        j.feature = feature;
        j.status = JobStatus.DONE;
        j.adminId = adminId;
        j.subjectType = subjectType;
        j.subjectId = subjectId;
        j.mode = JobMode.NORMAL;
        j.effort = "none";
        j.path = JobPath.MANUAL;
        j.errorCode = reason.name();
        j.outcome = "APPLIED";
        j.outcomeAt = now;
        j.createdAt = now;
        j.finishedAt = now;
        return j;
    }

    /** A worker takes the job: QUEUED → RUNNING, one more attempt, a deadline for the whole run. */
    public void claim(String worker, Instant now, Duration deadline) {
        moveTo(JobStatus.RUNNING);
        attempts++;
        lockedBy = worker;
        startedAt = now;
        heartbeatAt = now;
        deadlineAt = now.plus(deadline);
    }

    public void heartbeat(Instant now) {
        heartbeatAt = now;
    }

    /** The run ended with an answer; {@code verdict} is DONE, EMPTY or BAD_ANSWER from the structural check. */
    public void finish(JobStatus verdict, JobTotals totals, Instant now) {
        if (verdict != JobStatus.DONE && verdict != JobStatus.EMPTY && verdict != JobStatus.BAD_ANSWER) {
            throw new IllegalArgumentException("not a verdict: " + verdict);
        }
        moveTo(verdict);
        end(totals, now);
    }

    public void fail(String code, String note, JobTotals totals, Instant now) {
        moveTo(JobStatus.FAILED);
        errorCode = code;
        errorNote = note == null ? null : note.length() > 255 ? note.substring(0, 255) : note;
        end(totals, now);
    }

    public void cancel(JobTotals totals, Instant now) {
        moveTo(JobStatus.CANCELED);
        end(totals, now);
    }

    /**
     * The admin pressed «Остановить». A queued job stops at once; a running one gets the flag and stops before its next
     * turn or right after the current model call (its answer is not used). Returns true when the job is already canceled.
     */
    public boolean requestCancel(Instant now) {
        if (status == JobStatus.QUEUED) {
            cancel(JobTotals.NONE, now);
            return true;
        }
        if (status == JobStatus.RUNNING) {
            cancelRequested = true;
        }
        return false;
    }

    /** The server stopped (or the worker died) under a running job: it goes back to the queue, the attempt stays counted. */
    public void requeue() {
        moveTo(JobStatus.QUEUED);
        lockedBy = null;
        startedAt = null;
        heartbeatAt = null;
        deadlineAt = null;
        cancelRequested = false;
    }

    /**
     * The batch stopped on a limit while this job ran or waited: it goes back to the queue and the attempt is not
     * counted (the job did nothing wrong; the batch will not take it until a person continues).
     */
    public void returnToQueue() {
        requeue();
        if (attempts > 0) {
            attempts--;
        }
    }

    /** What the admin did with the result. The first report stays: a repeated call changes nothing. Returns true if recorded. */
    public boolean recordOutcome(Outcome o, Instant now) {
        boolean hasResult = status == JobStatus.DONE || status == JobStatus.EMPTY || status == JobStatus.BAD_ANSWER;
        if (outcome != null || !hasResult) {
            return false;
        }
        outcome = o.verdict();
        outcomeApplied = o.applied();
        outcomeRejected = o.rejected();
        outcomeEdited = o.edited();
        outcomeIgnored = o.ignoredLocked();
        outcomeAt = now;
        return true;
    }

    /** The step of the current run; null when the job does not run or this run has not reported one yet. */
    public String currentStep() {
        boolean thisRun = stepAt != null && startedAt != null && !stepAt.isBefore(startedAt);
        return status == JobStatus.RUNNING && thisRun ? step : null;
    }

    /** A running job whose worker has been silent for longer than {@code silence}: its instance is gone. */
    public boolean stale(Instant now, Duration silence) {
        return status == JobStatus.RUNNING && heartbeatAt != null && heartbeatAt.plus(silence).isBefore(now);
    }

    private void end(JobTotals t, Instant now) {
        costMicroUsd = t.costMicroUsd();
        rateMilli = t.rateMilli();
        inputTokens = t.tokens().input();
        cachedTokens = t.tokens().cached();
        outputTokens = t.tokens().output();
        modelCalls = t.modelCalls();
        searches = t.searches();
        pages = t.pages();
        repaired = t.repaired();
        finishedAt = now;
        lockedBy = null;
    }

    private void moveTo(JobStatus next) {
        if (!status.canMoveTo(next)) {
            throw new IllegalStateException("AI job " + id + ": " + status + " -> " + next + " is not allowed");
        }
        status = next;
    }
}
