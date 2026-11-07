package com.maxsolch.shop.ai.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * The heavy part of a job (V87): the prompt it was given and the answer it returned; purged after the retention days.
 * Also the fields of the object at the start (V92, JSON of {@link SubjectFields#snapshot}): what the AI was given to
 * work on, so the review can tell what somebody changed meanwhile, on any device.
 */
@Getter
@Entity
@Table(name = "ai_job_bodies")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiJobBody {

    @Id
    @Column(name = "job_id")
    private Long jobId;

    @Column(name = "prompt", nullable = false)
    private String prompt;

    @Column(name = "answer")
    private String answer;

    @Column(name = "subject_snapshot")
    private String subjectSnapshot;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** @param subjectSnapshot JSON of the object's fields at the start; null when the object has no such port */
    public static AiJobBody of(long jobId, String prompt, String subjectSnapshot, Instant now) {
        AiJobBody b = new AiJobBody();
        b.jobId = jobId;
        b.prompt = prompt;
        b.subjectSnapshot = subjectSnapshot;
        b.createdAt = now;
        return b;
    }

    public void answered(String text) {
        this.answer = text;
    }
}
