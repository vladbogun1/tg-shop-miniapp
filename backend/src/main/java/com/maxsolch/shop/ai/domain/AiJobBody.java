package com.maxsolch.shop.ai.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** The heavy part of a job (V87): the prompt it was given and the answer it returned; purged after the retention days. */
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

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public static AiJobBody of(long jobId, String prompt, Instant now) {
        AiJobBody b = new AiJobBody();
        b.jobId = jobId;
        b.prompt = prompt;
        b.createdAt = now;
        return b;
    }

    public void answered(String text) {
        this.answer = text;
    }
}
