package com.maxsolch.shop.procurement.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * «Поставка с ИИ» before it is a batch (V93): the admin gave the invoice pictures and pressed one button; the server
 * walks the steps (read the invoice, match the lines, cards of the new products) and keeps everything here, in
 * {@code state} (a {@code supplyai.DraftState} as JSON), so leaving the screen loses neither the progress nor the
 * paid answers. Nothing exists in the catalog or the batches until the admin accepts the result.
 */
@Getter
@Entity
@Table(name = "supply_drafts")
public class SupplyDraft {

    public enum Status {
        /** The steps run; the timer moves the draft on. */
        RUNNING,
        /** All steps done (some maybe with warnings): waits for the admin's check. */
        READY,
        /** Reading the invoice did not work; the admin may repeat it. */
        FAILED,
        /** The batch {@code batchId} was created from it. */
        ACCEPTED
    }

    public enum Step {
        READ, MATCH, CARDS, DONE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "admin_id", nullable = false, updatable = false)
    private long adminId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(name = "step", nullable = false, length = 16)
    private Step step;

    @Column(name = "title", length = 255)
    private String title;

    @Column(name = "failure", length = 500)
    private String failure;

    @Column(name = "file_ids", nullable = false, length = 500)
    private String fileIds;

    @Column(name = "state", nullable = false)
    private String state;

    @Column(name = "batch_id")
    private Long batchId;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "ready_at")
    private Instant readyAt;

    protected SupplyDraft() {
    }

    public static SupplyDraft start(long adminId, List<Long> fileIds, String emptyState, Instant now) {
        SupplyDraft d = new SupplyDraft();
        d.adminId = adminId;
        d.status = Status.RUNNING;
        d.step = Step.READ;
        d.fileIds = fileIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        d.state = emptyState;
        d.createdAt = now;
        d.updatedAt = now;
        return d;
    }

    public List<Long> fileIdList() {
        return fileIds.isBlank() ? List.of() : Arrays.stream(fileIds.split(",")).map(Long::valueOf).toList();
    }

    public void write(String newState, String newTitle, Instant now) {
        this.state = newState;
        this.title = newTitle == null ? null : newTitle.substring(0, Math.min(255, newTitle.length()));
        this.updatedAt = now;
    }

    /** The next step of the run (also back from READY when the admin asks to finish what is missing). */
    public void runStep(Step next, Instant now) {
        this.status = Status.RUNNING;
        this.step = next;
        this.failure = null;
        this.updatedAt = now;
    }

    public void ready(Instant now) {
        this.status = Status.READY;
        this.step = Step.DONE;
        this.readyAt = now;
        this.updatedAt = now;
    }

    public void fail(String reason, Instant now) {
        this.status = Status.FAILED;
        this.failure = reason == null ? null : reason.substring(0, Math.min(500, reason.length()));
        this.updatedAt = now;
    }

    public void accepted(long newBatchId, Instant now) {
        this.status = Status.ACCEPTED;
        this.batchId = newBatchId;
        this.updatedAt = now;
    }

    /** The admin's own draft, or one he may see with the finance right (an invoice is purchase data). */
    public boolean visibleTo(long viewerId, boolean finance) {
        return finance || adminId == viewerId;
    }
}
