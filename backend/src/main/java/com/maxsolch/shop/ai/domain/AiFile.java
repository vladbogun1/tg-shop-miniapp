package com.maxsolch.shop.ai.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * A picture of a document for «Прочитать с ИИ» (V91): one screenshot, a photo or one page of a PDF, already re-encoded
 * (at most 1600 px, no metadata). The bytes live in the storage under {@link #getObjectKey()}; the row says whose they
 * are, which task reads them (empty until the task is created) and when they are deleted for good.
 */
@Getter
@Entity
@Table(name = "ai_files")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiFile {

    /** How long a file lives, whatever happens to the task. */
    public static final Duration KEEP = Duration.ofDays(7);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_id")
    private Long jobId;

    @Column(name = "admin_id", nullable = false)
    private long adminId;

    @Column(name = "upload_id", nullable = false, length = 36)
    private String uploadId;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "object_key", nullable = false, length = 120)
    private String objectKey;

    @Column(name = "mime", nullable = false, length = 32)
    private String mime;

    @Column(name = "size", nullable = false)
    private int size;

    @Column(name = "page")
    private Integer page;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public static AiFile of(long adminId, String uploadId, String name, String objectKey, String mime, int size,
                            Integer page, Instant now) {
        AiFile f = new AiFile();
        f.adminId = adminId;
        f.uploadId = uploadId;
        f.name = name.length() > 160 ? name.substring(0, 160) : name;
        f.objectKey = objectKey;
        f.mime = mime;
        f.size = size;
        f.page = page;
        f.createdAt = now;
        f.expiresAt = now.plus(KEEP);
        return f;
    }

    /** The task that reads this file; a file is read by one task only. */
    public void attachTo(long jobId) {
        this.jobId = jobId;
    }

    public boolean attached() {
        return jobId != null;
    }
}
