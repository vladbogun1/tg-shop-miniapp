package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobStatus;
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
}
