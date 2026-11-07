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

import java.time.Instant;

/**
 * A batch of AI tasks (V90): the parent of N rows in {@code ai_jobs} (one product = one job). The batch holds only the
 * state of the whole: running, paused (with the reason), done, canceled; the numbers «12 из 30» are counted from the
 * jobs. The status changes only through the methods here and only along {@link BatchStatus}; asking for a move that
 * has already happened (a second job hitting the same limit) changes nothing.
 */
@Getter
@Entity
@Table(name = "ai_batches")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiBatch {

    /** Two jobs at once from a batch of this many products or more: a big batch must not crowd out single tasks. */
    public static final int BIG = 20;
    public static final int PARALLEL_BIG = 2;
    public static final int PARALLEL_SMALL = 3;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "feature", nullable = false, length = 32)
    private AiFeature feature;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 12)
    private BatchStatus status;

    @Column(name = "admin_id", nullable = false)
    private long adminId;

    @Column(name = "total", nullable = false)
    private int total;

    @Column(name = "parallel", nullable = false)
    private int parallel;

    @Enumerated(EnumType.STRING)
    @Column(name = "pause_reason", length = 16)
    private PauseReason pauseReason;

    @Column(name = "idem_key", length = 64)
    private String idemKey;

    @Column(name = "retry_of")
    private Long retryOf;

    /** BUILTIN — the AI does the jobs; MANUAL — the admin pastes answers from ChatGPT part by part (V92). */
    @Enumerated(EnumType.STRING)
    @Column(name = "path", nullable = false, length = 12)
    private JobPath path = JobPath.BUILTIN;

    /** A manual batch: its objects with their snapshot at the start (JSON written by the server). */
    @Column(name = "subjects")
    private String subjects;

    /** A manual batch: the screen's draft (the current part, the pasted answers; JSON the screen writes). */
    @Column(name = "draft")
    private String draft;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    public static AiBatch started(AiFeature feature, long adminId, int total, String idemKey, Long retryOf,
                                  Instant now) {
        AiBatch b = new AiBatch();
        b.feature = feature;
        b.status = BatchStatus.RUNNING;
        b.adminId = adminId;
        b.total = total;
        b.parallel = total >= BIG ? PARALLEL_BIG : PARALLEL_SMALL;
        b.idemKey = idemKey;
        b.retryOf = retryOf;
        b.createdAt = now;
        b.updatedAt = now;
        return b;
    }

    /**
     * A manual batch: open (RUNNING) until the admin finishes or discards it; no worker takes anything from it — the
     * jobs appear as the admin pastes the answers.
     */
    public static AiBatch manual(AiFeature feature, long adminId, int total, String subjects, String draft, Instant now) {
        AiBatch b = started(feature, adminId, total, null, null, now);
        b.parallel = 0;
        b.path = JobPath.MANUAL;
        b.subjects = subjects;
        b.draft = draft;
        return b;
    }

    /** The screen saved its draft; only while the manual batch is open. Returns true if saved. */
    public boolean saveDraft(String json, Instant now) {
        if (path != JobPath.MANUAL || !status.open()) {
            return false;
        }
        draft = json;
        updatedAt = now;
        return true;
    }

    /** RUNNING → PAUSED; the first reason stays when several jobs report the same stop. Returns true if it moved. */
    public boolean pause(PauseReason reason, Instant now) {
        if (status != BatchStatus.RUNNING) {
            return false;
        }
        status = BatchStatus.PAUSED;
        pauseReason = reason;
        updatedAt = now;
        return true;
    }

    /** PAUSED → RUNNING by a person's button. */
    public boolean resume(Instant now) {
        if (status != BatchStatus.PAUSED) {
            return false;
        }
        status = BatchStatus.RUNNING;
        pauseReason = null;
        updatedAt = now;
        return true;
    }

    /** The last job has ended (also on a paused batch with nothing left): → DONE. True only for the call that moved it (it sends the one push). */
    public boolean complete(Instant now) {
        if (!status.open()) {
            return false;
        }
        status = BatchStatus.DONE;
        updatedAt = now;
        finishedAt = now;
        return true;
    }

    public boolean cancel(Instant now) {
        if (!status.open()) {
            return false;
        }
        status = BatchStatus.CANCELED;
        pauseReason = null;
        updatedAt = now;
        finishedAt = now;
        return true;
    }
}
