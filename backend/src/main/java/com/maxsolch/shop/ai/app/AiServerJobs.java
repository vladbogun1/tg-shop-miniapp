package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Tasks a server process starts for an admin (the supply draft walks its steps on a timer, long after the request that
 * created it): the same rules as {@link AiJobs#create} — the AI and the feature on, the limits, one active task per
 * object — but the admin is named, not read from a request. A task already running for the object is returned as it
 * is (a tick that repeats after a crash finds its own task, it does not start a second one). The pictures, if any, are
 * given in the same transaction. A refusal is the usual {@link DomainException}: the caller decides what it means.
 */
@Service
public class AiServerJobs {

    private final AiJobLifecycle lifecycle;
    private final AiJobReads reads;
    private final AiLimits limits;
    private final AiPolicy policy;
    private final AiAgent agent;
    private final AiFiles files;
    private final AdminAccess access;
    private final AdminAuditService audit;

    public AiServerJobs(AiJobLifecycle lifecycle, AiJobReads reads, AiLimits limits, AiPolicy policy, AiAgent agent,
                        AiFiles files, AdminAccess access, AdminAuditService audit) {
        this.lifecycle = lifecycle;
        this.reads = reads;
        this.limits = limits;
        this.policy = policy;
        this.agent = agent;
        this.files = files;
        this.access = access;
        this.audit = audit;
    }

    /** Starts (or finds running) the task; returns its id. {@code fileIds} — pictures to give it, or an empty list. */
    @Transactional
    public long start(long adminId, AiJobs.CreateJob req, List<Long> fileIds) {
        AiJobs.validate(req, null);
        Optional<AiJobDto> running = reads.activeFor(req.subjectType(), req.subjectId(), false);
        if (running.isPresent()) {
            return running.get().id();
        }
        if (!agent.configured()) {
            throw new DomainException.Unavailable(AiError.NOT_CONFIGURED);
        }
        if (!policy.enabled() || !policy.featureOn(req.feature())) {
            throw new DomainException.Conflict(AiError.DISABLED);
        }
        JobMode mode = req.mode() == null ? JobMode.NORMAL : req.mode();
        limits.preflight(req.feature(), mode, Math.max(1, req.researchItems()));
        AiJob job = lifecycle.insert(new AiJob.Spec(req.feature(), adminId, req.subjectType(), req.subjectId(),
                req.subjectVersion(), mode, req.effort(), req.researchItems(), req.promptVersion(), null, null), req.prompt());
        if (!fileIds.isEmpty()) {
            files.attach(adminId, fileIds, job.getId());
        }
        audit.recordFor(adminId, "AI_JOB_START", req.subjectType(), req.subjectId(), "ИИ: " + req.feature());
        return job.getId();
    }

    /** The task as its admin sees it (the cost only for the finance right), with the answer once it is done. */
    @Transactional(readOnly = true)
    public Optional<AiJobDto> read(long jobId, long adminId) {
        return reads.read(jobId, adminId, access.canSeeFinance(adminId));
    }

    /** Asks the running task to stop (the worker ends it at its next step); a finished one is left alone. */
    @Transactional
    public void cancel(long jobId) {
        reads.source(jobId).filter(s -> s.job().getStatus().active()).ifPresent(s -> lifecycle.requestCancel(jobId));
    }
}
