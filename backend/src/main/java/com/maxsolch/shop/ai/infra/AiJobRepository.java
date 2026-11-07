package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.JobStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AiJobRepository extends JpaRepository<AiJob, Long> {

    Optional<AiJob> findByAdminIdAndIdemKey(long adminId, String idemKey);

    Optional<AiJob> findFirstBySubjectTypeAndSubjectIdAndStatusIn(String subjectType, String subjectId,
                                                                  Collection<JobStatus> statuses);

    List<AiJob> findByStatusInOrderByIdDesc(Collection<JobStatus> statuses);

    List<AiJob> findByStatusAndHeartbeatAtBefore(JobStatus status, Instant before);

    List<AiJob> findByStatusAndLockedBy(JobStatus status, String lockedBy);

    boolean existsByRetryOf(long retryOf);

    List<AiJob> findByBatchIdOrderByIdAsc(long batchId);

    /** The newest ended jobs of a batch, for the «three failures in a row» rule. */
    List<AiJob> findTop3ByBatchIdAndFinishedAtIsNotNullOrderByFinishedAtDescIdDesc(long batchId);

    long countByStatus(JobStatus status);

    /** Ready results nobody has decided on yet (the chip and the badge: "waiting for review"). */
    long countByStatusAndOutcomeIsNullAndFinishedAtAfter(JobStatus status, Instant since);

    /** Failed or unreadable jobs of the last day that nobody has retried since. */
    @Query("select count(j) from AiJob j where j.status in :statuses and j.finishedAt > :since "
            + "and not exists (select 1 from AiJob r where r.retryOf = j.id)")
    long countUnretried(@Param("statuses") Collection<JobStatus> statuses, @Param("since") Instant since);

    /** One heartbeat for every job a worker runs. */
    @Modifying
    @Query("update AiJob j set j.heartbeatAt = :now where j.lockedBy = :worker and j.status = com.maxsolch.shop.ai.domain.JobStatus.RUNNING")
    int heartbeat(@Param("worker") String worker, @Param("now") Instant now);

    // ---- the task center: the lists of the four tabs (the AI's own jobs, not the marks of the manual way) ----

    Page<AiJob> findByPathOrderByIdDesc(JobPath path, Pageable page);

    Page<AiJob> findByPathAndStatusInOrderByIdDesc(JobPath path, Collection<JobStatus> statuses, Pageable page);

    /** Ready results nobody has decided on: the tab «Проверить» (any age; the screen marks the old ones). */
    Page<AiJob> findByPathAndStatusAndOutcomeIsNullOrderByIdDesc(JobPath path, JobStatus status, Pageable page);

    /** Failed, unreadable or empty jobs since {@code since} that nobody has asked again: the tab «Проблемы». */
    @Query(value = "select j from AiJob j where j.path = com.maxsolch.shop.ai.domain.JobPath.BUILTIN "
            + "and j.status in :statuses and j.finishedAt > :since "
            + "and not exists (select 1 from AiJob r where r.retryOf = j.id) order by j.id desc",
            countQuery = "select count(j) from AiJob j where j.path = com.maxsolch.shop.ai.domain.JobPath.BUILTIN "
                    + "and j.status in :statuses and j.finishedAt > :since "
                    + "and not exists (select 1 from AiJob r where r.retryOf = j.id)")
    Page<AiJob> problems(@Param("statuses") Collection<JobStatus> statuses, @Param("since") Instant since,
                         Pageable page);

    long countByPathAndStatusIn(JobPath path, Collection<JobStatus> statuses);

    long countByPathAndStatusAndOutcomeIsNull(JobPath path, JobStatus status);

    /** The latest job of the built-in AI for an object: what a manual application right after it says about «why». */
    Optional<AiJob> findFirstBySubjectTypeAndSubjectIdAndPathOrderByIdDesc(String subjectType, String subjectId,
                                                                          JobPath path);
}
