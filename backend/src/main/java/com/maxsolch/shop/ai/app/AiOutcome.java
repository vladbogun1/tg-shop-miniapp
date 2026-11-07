package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

/**
 * What the admin did with a result (applied N fields, rejected M…), reported by the review screen. The first report
 * stays; sending it again (a double click, a retried request) changes nothing and answers with the same job, so the
 * counts are never doubled. Only a job that has a result (DONE, EMPTY, BAD_ANSWER) has an outcome.
 */
@Service
public class AiOutcome {

    private final AiJobRepository jobs;
    private final AdminAuditService audit;
    private final Clock clock;

    public AiOutcome(AiJobRepository jobs, AdminAuditService audit, Clock clock) {
        this.jobs = jobs;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public AiJob record(long jobId, AiJob.Outcome outcome) {
        AiJob job = jobs.findById(jobId).orElseThrow(() -> new DomainException.NotFound(AiError.JOB_NOT_FOUND));
        if (outcome.applied() < 0 || outcome.rejected() < 0 || outcome.edited() < 0 || outcome.ignoredLocked() < 0) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "outcome");
        }
        if (job.recordOutcome(outcome, clock.instant())) {
            audit.record("AI_JOB_OUTCOME", job.getSubjectType(), job.getSubjectId(),
                    "ИИ: " + job.getOutcome() + " (принято " + outcome.applied() + ", отклонено " + outcome.rejected()
                            + ", с правками " + outcome.edited() + ")");
        }
        return job;
    }
}
