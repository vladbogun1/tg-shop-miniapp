package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiApplyLog;
import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.BatchStatus;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.infra.AiApplyLogRepository;
import com.maxsolch.shop.ai.infra.AiBatchQueries;
import com.maxsolch.shop.ai.infra.AiBatchRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/** Reading batches for the screens: one batch with its jobs, and the batches the bar and the review feed need. */
@Service
public class AiBatchReads {

    private static final Set<JobStatus> RETRYABLE = EnumSet.of(JobStatus.FAILED, JobStatus.BAD_ANSWER, JobStatus.EMPTY);
    /** A finished batch stays on the bar this long if something is left to do with it. */
    private static final Duration LINGER = Duration.ofHours(24);

    private final AiBatchRepository batches;
    private final AiJobRepository jobs;
    private final AiApplyLogRepository applies;
    private final AiBatchQueries queries;
    private final AiPolicy policy;
    private final Clock clock;

    public AiBatchReads(AiBatchRepository batches, AiJobRepository jobs, AiApplyLogRepository applies,
                        AiBatchQueries queries, AiPolicy policy, Clock clock) {
        this.batches = batches;
        this.jobs = jobs;
        this.applies = applies;
        this.queries = queries;
        this.policy = policy;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<AiBatchDto> read(long id, boolean finance) {
        return batches.findById(id).map(b -> dto(b, finance));
    }

    /** Running and paused batches of everybody, plus the finished batches of this admin that still have something to do. */
    @Transactional(readOnly = true)
    public List<AiBatchDto> active(long adminId, boolean finance) {
        Instant since = clock.instant().minus(LINGER);
        List<AiBatch> open = batches.findByStatusInOrderByIdDesc(EnumSet.of(BatchStatus.RUNNING, BatchStatus.PAUSED));
        List<AiBatch> mine = batches.findByAdminIdAndFinishedAtAfterOrderByIdDesc(adminId, since);
        return java.util.stream.Stream.concat(open.stream(), mine.stream()).distinct()
                .sorted(java.util.Comparator.comparing(AiBatch::getId).reversed())
                .map(b -> dto(b, finance))
                .filter(d -> d.status().open() || d.ready() > 0 || d.retryable() > 0 || d.undoable() > 0)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AiJob> jobsOf(long batchId) {
        return jobs.findByBatchIdOrderByIdAsc(batchId);
    }

    AiBatchDto dto(AiBatch b, boolean finance) {
        List<AiJob> list = jobs.findByBatchIdOrderByIdAsc(b.getId());
        List<AiBatchDto.Row> rows = list.stream().map(AiBatchReads::row).toList();
        int retryable = (int) list.stream().filter(j -> RETRYABLE.contains(j.getStatus()) && !jobs.existsByRetryOf(j.getId())).count();
        Instant now = clock.instant();
        List<AiApplyLog> live = applies.findByBatchIdAndKindOrderByIdAsc(b.getId(), AiApplyLog.Kind.SAFE).stream()
                .filter(a -> a.undoable(now)).toList();
        Instant until = live.stream().map(AiApplyLog::undoUntil).min(Instant::compareTo).orElse(null);
        Long spent = finance ? AiMoney.costMinor(queries.spentMicro(b.getId()), policy.rateMilli()) : null;
        return AiBatchDto.of(b, rows, new AiBatchDto.Extras(retryable, live.size(), until, spent));
    }

    private static AiBatchDto.Row row(AiJob j) {
        return new AiBatchDto.Row(j.getId(), j.getSubjectId(), j.getStatus(), j.getOutcome(), j.getErrorCode(),
                j.getSearches() > 0);
    }
}
