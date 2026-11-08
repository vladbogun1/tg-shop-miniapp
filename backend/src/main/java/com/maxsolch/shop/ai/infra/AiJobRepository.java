package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiFeature;
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

    /**
     * Ready results nobody has decided on yet (the chip and the badge: "waiting for review"); the objects decided on
     * their own screen ({@code ownScreen}, see {@code OwnScreen}) are not waiting for this review.
     */
    @Query("select count(j) from AiJob j where j.status = com.maxsolch.shop.ai.domain.JobStatus.DONE "
            + "and j.outcome is null and j.finishedAt > :since and j.subjectType not in :ownScreen")
    long countToReview(@Param("since") Instant since, @Param("ownScreen") Collection<String> ownScreen);

    /** Failed or unreadable jobs of the last day that nobody has retried since. */
    @Query("select count(j) from AiJob j where j.status in :statuses and j.finishedAt > :since "
            + "and not exists (select 1 from AiJob r where r.retryOf = j.id)")
    long countUnretried(@Param("statuses") Collection<JobStatus> statuses, @Param("since") Instant since);

    /** One heartbeat for every job a worker runs. */
    @Modifying
    @Query("update AiJob j set j.heartbeatAt = :now where j.lockedBy = :worker and j.status = com.maxsolch.shop.ai.domain.JobStatus.RUNNING")
    int heartbeat(@Param("worker") String worker, @Param("now") Instant now);

    /** The current step of a running job, only while this worker still holds it (V92; the entity never writes it). */
    @Modifying
    @Query(value = "update ai_jobs set step = :step, step_at = :now where id = :id and locked_by = :worker "
            + "and status = 'RUNNING'", nativeQuery = true)
    int step(@Param("id") long id, @Param("worker") String worker, @Param("step") String step,
             @Param("now") Instant now);

    // ---- the task center: the lists of the four tabs (the AI's own jobs and the pasted answers of the manual way,
    //      not the marks of the manual way) ----

    /**
     * Results nobody has decided on, of the AI and pasted from ChatGPT: the tab «Проверить». Not the objects decided on
     * their own screen ({@code ownScreen}).
     */
    @Query(value = "select j from AiJob j where (j.path = com.maxsolch.shop.ai.domain.JobPath.BUILTIN or j.pasted = true) "
            + "and j.status = com.maxsolch.shop.ai.domain.JobStatus.DONE and j.outcome is null "
            + "and j.subjectType not in :ownScreen order by j.id desc",
            countQuery = "select count(j) from AiJob j where (j.path = com.maxsolch.shop.ai.domain.JobPath.BUILTIN "
                    + "or j.pasted = true) and j.status = com.maxsolch.shop.ai.domain.JobStatus.DONE and j.outcome is null "
                    + "and j.subjectType not in :ownScreen")
    Page<AiJob> toReview(@Param("ownScreen") Collection<String> ownScreen, Pageable page);

    /** Every task, of the AI and pasted from ChatGPT: the tab «История». */
    @Query(value = "select j from AiJob j where j.path = com.maxsolch.shop.ai.domain.JobPath.BUILTIN or j.pasted = true "
            + "order by j.id desc",
            countQuery = "select count(j) from AiJob j where j.path = com.maxsolch.shop.ai.domain.JobPath.BUILTIN "
                    + "or j.pasted = true")
    Page<AiJob> tasks(Pageable page);

    /** The jobs of a manual batch for one object (one at most: a newer answer replaces the pending one). */
    Optional<AiJob> findFirstByBatchIdAndSubjectIdOrderByIdDesc(long batchId, String subjectId);

    /** An answer of one product pasted outside a batch that nobody has decided on: a newer one replaces it. */
    @Query("select j from AiJob j where j.adminId = :adminId and j.subjectType = :type and j.subjectId = :id "
            + "and j.pasted = true and j.batchId is null and j.outcome is null order by j.id desc")
    List<AiJob> pendingPasted(@Param("adminId") long adminId, @Param("type") String subjectType,
                              @Param("id") String subjectId);

    Page<AiJob> findByPathAndStatusInOrderByIdDesc(JobPath path, Collection<JobStatus> statuses, Pageable page);

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

    /** The latest job of the built-in AI for an object: what a manual application right after it says about «why». */
    Optional<AiJob> findFirstBySubjectTypeAndSubjectIdAndPathOrderByIdDesc(String subjectType, String subjectId,
                                                                          JobPath path);

    /** The admin's latest built-in job of a feature whose objects are not products (a part of the translations). */
    Optional<AiJob> findFirstByFeatureAndAdminIdAndPathOrderByIdDesc(AiFeature feature, long adminId, JobPath path);
}
