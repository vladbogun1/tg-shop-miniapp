package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.ManualReason;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * A mark for each result the admin applied by the manual way (through ChatGPT), so the metrics can tell the share of
 * the built-in AI from the manual way: without it the share would always be 100 %. The screen reports once per unit the
 * built-in AI also counts by — an applied product for the cards, a sent part of the prompt for the translations (one
 * built-in translation job is one part); the server decides the reason itself (the AI is off or not set up, a limit is used up, the AI
 * has just failed for this object, or the admin simply chose the manual way), so no screen can lie about it.
 */
@Service
public class AiManualMarks {

    static final int MAX_SUBJECTS = 100;
    static final Duration FAILURE_WINDOW = Duration.ofDays(1);
    private static final Set<JobStatus> FAILED = Set.of(JobStatus.FAILED, JobStatus.BAD_ANSWER, JobStatus.EMPTY);

    private final AiJobRepository jobs;
    private final AiPolicy policy;
    private final AiLimits limits;
    private final AiAgent agent;
    private final CurrentActor actor;
    private final Clock clock;

    public AiManualMarks(AiJobRepository jobs, AiPolicy policy, AiLimits limits, AiAgent agent, CurrentActor actor,
                         Clock clock) {
        this.jobs = jobs;
        this.policy = policy;
        this.limits = limits;
        this.agent = agent;
        this.actor = actor;
        this.clock = clock;
    }

    /**
     * @param subjectIds what the result was applied to: product ids for the cards, ids of the sent prompt parts for the
     *                   translations (any text unique to the part, up to 64 characters)
     */
    public record Mark(AiFeature feature, List<String> subjectIds) {
    }

    /** The objects of a feature, as its built-in jobs name them. */
    static String subjectType(AiFeature feature) {
        return switch (feature) {
            case TRANSLATION -> "TRANSLATION_PART";
            case SUPPLY_EXTRACT, SUPPLY_MATCH -> "SUPPLY_FILES";
            default -> "PRODUCT";
        };
    }

    @Transactional
    public int record(Mark req) {
        validate(req);
        Instant now = clock.instant();
        long adminId = actor.userId();
        for (String id : req.subjectIds()) {
            ManualReason reason = reason(req.feature(), adminId, id, now);
            jobs.save(AiJob.manualMark(req.feature(), adminId, subjectType(req.feature()), id, reason, now));
        }
        return req.subjectIds().size();
    }

    ManualReason reason(AiFeature feature, long adminId, String subjectId, Instant now) {
        if (!agent.configured() || !policy.enabled() || !policy.featureOn(feature)) {
            return ManualReason.OFF;
        }
        if (limits.exhausted().isPresent()) {
            return ManualReason.LIMIT;
        }
        // a product has its own history; a manual part of the translations has no built-in twin, so the admin's last
        // built-in job of the feature tells whether the AI has just failed him
        Optional<AiJob> last = "PRODUCT".equals(subjectType(feature))
                ? jobs.findFirstBySubjectTypeAndSubjectIdAndPathOrderByIdDesc("PRODUCT", subjectId, JobPath.BUILTIN)
                : jobs.findFirstByFeatureAndAdminIdAndPathOrderByIdDesc(feature, adminId, JobPath.BUILTIN);
        boolean failed = last
                .filter(j -> FAILED.contains(j.getStatus()) && j.getFinishedAt() != null
                        && j.getFinishedAt().isAfter(now.minus(FAILURE_WINDOW)))
                .isPresent();
        return failed ? ManualReason.FAILURE : ManualReason.CHOICE;
    }

    static void validate(Mark req) {
        if (req == null || req.feature() == null || req.feature() == AiFeature.SEARCH_TEST) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        if (req.subjectIds() == null || req.subjectIds().isEmpty() || req.subjectIds().size() > MAX_SUBJECTS) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subjectIds");
        }
        for (String id : req.subjectIds()) {
            if (id == null || id.isBlank() || id.length() > 64) {
                throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subjectIds");
            }
        }
    }
}
