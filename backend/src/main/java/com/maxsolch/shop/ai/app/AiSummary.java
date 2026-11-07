package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

/**
 * One light answer for what every admin screen needs about the AI, without any money: the chip in the header
 * (running, waiting for review, problems, switched off) and the entry buttons (is the key set, are the AI and the
 * feature switched on, is a day or month limit used up: then the manual way goes first). The money numbers stay in
 * {@link AiState}, for the finance right only.
 */
@Service
public class AiSummary {

    /** Results older than this are not counted as waiting: they are stale anyway. */
    static final Duration REVIEW_WINDOW = Duration.ofDays(14);
    static final Duration PROBLEM_WINDOW = Duration.ofDays(1);

    /**
     * @param featuresOn the features the owner switched on
     * @param limit "DAY" / "MONTH" when that limit is used up, else null
     * @param running tasks queued or running; review: ready results nobody decided on; problems: failed in the last day
     */
    public record Summary(boolean configured, boolean enabled, List<AiFeature> featuresOn, String limit, int running,
                          int review, int problems) {
    }

    private final AiPolicy policy;
    private final AiLimits limits;
    private final AiAgent agent;
    private final com.maxsolch.shop.ai.infra.AiJobRepository jobs;
    private final Clock clock;

    public AiSummary(AiPolicy policy, AiLimits limits, AiAgent agent, AiJobRepository jobs, Clock clock) {
        this.policy = policy;
        this.limits = limits;
        this.agent = agent;
        this.jobs = jobs;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Summary summary() {
        var now = clock.instant();
        List<AiFeature> on = Arrays.stream(AiFeature.values())
                .filter(f -> f != AiFeature.SEARCH_TEST && policy.featureOn(f)).toList();
        String limit = limits.exhausted().map(e -> e == AiError.MONTH_LIMIT ? "MONTH" : "DAY").orElse(null);
        int running = (int) (jobs.countByStatus(JobStatus.QUEUED) + jobs.countByStatus(JobStatus.RUNNING));
        int review = (int) jobs.countByStatusAndOutcomeIsNullAndFinishedAtAfter(JobStatus.DONE,
                now.minus(REVIEW_WINDOW));
        int problems = (int) jobs.countUnretried(List.of(JobStatus.FAILED, JobStatus.BAD_ANSWER),
                now.minus(PROBLEM_WINDOW));
        return new Summary(agent.configured(), policy.enabled(), on, limit, running, review, problems);
    }
}
