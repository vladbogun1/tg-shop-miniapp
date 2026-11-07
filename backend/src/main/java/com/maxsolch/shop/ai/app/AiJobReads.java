package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiJobBody;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.infra.AiJobBodyRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** Reading jobs for the screens: the job with its texts, the list of active ones, the source of a retry. */
@Service
public class AiJobReads {

    private static final List<JobStatus> ACTIVE = List.of(JobStatus.QUEUED, JobStatus.RUNNING);

    private final AiJobRepository jobs;
    private final AiJobBodyRepository bodies;
    private final AiSubjectChanges changes;

    public AiJobReads(AiJobRepository jobs, AiJobBodyRepository bodies, AiSubjectChanges changes) {
        this.jobs = jobs;
        this.bodies = bodies;
        this.changes = changes;
    }

    /** What a retry starts from: the job and the prompt it was given (empty once the prompt is purged). */
    public record Source(AiJob job, String prompt) {
    }

    /** The job as {@code viewerId} sees it: money only with {@code finance}, an invoice's texts also to its starter. */
    @Transactional(readOnly = true)
    public Optional<AiJobDto> read(long id, long viewerId, boolean finance) {
        return jobs.findById(id).map(j -> {
            Optional<AiJobBody> b = bodies.findById(id);
            return AiJobDto.of(j, body(j, b, finance || j.getAdminId() == viewerId), finance,
                    changes.since(j, b.map(AiJobBody::getSubjectSnapshot).orElse(null)));
        });
    }

    /** Active jobs, newest first, without texts: the screens ask for them to show "already running" and to resume. */
    @Transactional(readOnly = true)
    public List<AiJobDto> active(boolean finance) {
        return jobs.findByStatusInOrderByIdDesc(ACTIVE).stream().map(j -> AiJobDto.of(j, null, finance)).toList();
    }

    @Transactional(readOnly = true)
    public Optional<AiJobDto> activeFor(String subjectType, String subjectId, boolean finance) {
        return jobs.findFirstBySubjectTypeAndSubjectIdAndStatusIn(subjectType, subjectId, ACTIVE)
                .map(j -> AiJobDto.of(j, null, finance));
    }

    @Transactional(readOnly = true)
    public Optional<AiJobDto> byKey(long adminId, String idemKey, boolean finance) {
        return jobs.findByAdminIdAndIdemKey(adminId, idemKey).map(j -> AiJobDto.of(j, null, finance));
    }

    @Transactional(readOnly = true)
    public Optional<Source> source(long id) {
        return jobs.findById(id).map(j -> new Source(j, bodies.findById(id).map(AiJobBody::getPrompt).orElse(null)));
    }

    public boolean retried(long id) {
        return jobs.existsByRetryOf(id);
    }

    /**
     * The invoice text is purchase data: the answer of a supply job goes to the admin who uploaded the pictures (he has
     * the invoice anyway) and to an admin with the finance right, not to the other admins.
     */
    private static AiJobDto.Body body(AiJob job, Optional<AiJobBody> body, boolean mayReadPurchase) {
        if (!mayReadPurchase && job.getFeature().purchaseData()) {
            return new AiJobDto.Body(null, null);
        }
        return body.map(b -> new AiJobDto.Body(b.getPrompt(), b.getAnswer())).orElse(new AiJobDto.Body(null, null));
    }
}
