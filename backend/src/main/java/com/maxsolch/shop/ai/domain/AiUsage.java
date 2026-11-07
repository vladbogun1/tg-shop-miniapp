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
 * One external call the AI module made (V86): a model request, a web search or a page read — what it cost and whether
 * it worked. The month's spend and the limit are summed from here; the empty/failed searches per provider show when
 * a search engine started blocking us. Written once, never changed.
 */
@Getter
@Entity
@Table(name = "ai_usage")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiUsage {

    public enum Kind { MODEL, SEARCH, PAGE }

    public enum Result { OK, EMPTY, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** What the call served. */
    @Enumerated(EnumType.STRING)
    @Column(name = "feature", nullable = false, length = 32)
    private AiFeature feature;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    private Kind kind;

    /** Model name or provider: {@code MiniMax-M3.1-Flash}, {@code searxng}, {@code serper}, {@code direct}, {@code jina}. */
    @Column(name = "provider", nullable = false, length = 64)
    private String provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false, length = 16)
    private Result result;

    @Column(name = "input_tokens", nullable = false)
    private int inputTokens;

    @Column(name = "cached_tokens", nullable = false)
    private int cachedTokens;

    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;

    @Column(name = "cost_micro_usd", nullable = false)
    private long costMicroUsd;

    @Column(name = "duration_ms", nullable = false)
    private int durationMs;

    /** Why it failed or came back empty (an HTTP status, a timeout); null when it worked. */
    @Column(name = "note", length = 255)
    private String note;

    /** The job this line belongs to (V88); null for a call outside a job. */
    @Column(name = "job_id")
    private Long jobId;

    /** The admin who started that job. */
    @Column(name = "admin_id")
    private Long adminId;

    public static AiUsage model(Instant at, AiScope scope, String model, TokenUsage tokens, long costMicroUsd, long ms,
                                String note) {
        AiUsage u = base(at, scope, Kind.MODEL, model, note == null ? Result.OK : Result.FAILED, costMicroUsd, ms, note);
        u.inputTokens = tokens.input();
        u.cachedTokens = tokens.cached();
        u.outputTokens = tokens.output();
        return u;
    }

    public static AiUsage call(Instant at, AiScope scope, Kind kind, String provider, Result result, long costMicroUsd,
                               long ms, String note) {
        return base(at, scope, kind, provider, result, costMicroUsd, ms, note);
    }

    private static AiUsage base(Instant at, AiScope scope, Kind kind, String provider, Result result, long cost,
                                long ms, String note) {
        AiUsage u = new AiUsage();
        u.createdAt = at;
        u.feature = scope.feature();
        u.jobId = scope.jobId();
        u.adminId = scope.adminId();
        u.kind = kind;
        u.provider = provider;
        u.result = result;
        u.costMicroUsd = cost;
        u.durationMs = (int) Math.min(Integer.MAX_VALUE, Math.max(0, ms));
        u.note = note == null ? null : note.length() > 255 ? note.substring(0, 255) : note;
        return u;
    }
}
