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
 * One application of an AI result to an object (V90): the values before it, what it changed, and — for the mass
 * «Принять безопасное» — the 24 hours in which it can be undone. Created when the application starts (the snapshot),
 * finished when it is saved (the changes are found by comparing), undone at most once.
 */
@Getter
@Entity
@Table(name = "ai_apply_log")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiApplyLog {

    public static final Duration UNDO_WINDOW = Duration.ofHours(24);

    public enum Kind { SAFE, SINGLE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "batch_id")
    private Long batchId;

    @Column(name = "job_id", nullable = false)
    private long jobId;

    @Column(name = "subject_type", nullable = false, length = 24)
    private String subjectType;

    @Column(name = "subject_id", nullable = false, length = 64)
    private String subjectId;

    @Column(name = "admin_id", nullable = false)
    private long adminId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 8)
    private Kind kind;

    @Column(name = "snapshot", nullable = false)
    private String snapshot;

    @Column(name = "changes")
    private String changes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "applied_at")
    private Instant appliedAt;

    @Column(name = "undone_at")
    private Instant undoneAt;

    @Column(name = "undone_reverted")
    private Integer undoneReverted;

    @Column(name = "undone_skipped")
    private Integer undoneSkipped;

    public static AiApplyLog begin(AiJob job, long adminId, Kind kind, String snapshotJson, Instant now) {
        AiApplyLog l = new AiApplyLog();
        l.batchId = job.getBatchId();
        l.jobId = job.getId();
        l.subjectType = job.getSubjectType();
        l.subjectId = job.getSubjectId();
        l.adminId = adminId;
        l.kind = kind;
        l.snapshot = snapshotJson;
        l.createdAt = now;
        return l;
    }

    public void finish(String changesJson, Instant now) {
        this.changes = changesJson;
        this.appliedAt = now;
    }

    /** A later step of the application (photos, publishing) added to what it changed. */
    public void record(String changesJson) {
        this.changes = changesJson;
    }

    public boolean finished() {
        return appliedAt != null;
    }

    /** Applied, not yet undone and still inside the 24 hours. */
    public boolean undoable(Instant now) {
        return appliedAt != null && undoneAt == null && now.isBefore(appliedAt.plus(UNDO_WINDOW));
    }

    public Instant undoUntil() {
        return appliedAt == null ? null : appliedAt.plus(UNDO_WINDOW);
    }

    public void undone(int reverted, int skipped, Instant now) {
        this.undoneAt = now;
        this.undoneReverted = reverted;
        this.undoneSkipped = skipped;
    }
}
