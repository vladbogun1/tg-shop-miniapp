package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.BatchStatus;
import com.maxsolch.shop.ai.domain.JobPath;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AiBatchRepository extends JpaRepository<AiBatch, Long> {

    Optional<AiBatch> findByAdminIdAndIdemKey(long adminId, String idemKey);

    /** The admin's open manual batch (one at most). */
    Optional<AiBatch> findFirstByAdminIdAndPathAndStatusInOrderByIdDesc(long adminId, JobPath path,
                                                                       Collection<BatchStatus> statuses);

    List<AiBatch> findByStatusInOrderByIdDesc(Collection<BatchStatus> statuses);

    List<AiBatch> findByAdminIdAndFinishedAtAfterOrderByIdDesc(long adminId, java.time.Instant since);

    /** The row is locked until the transaction ends: two jobs ending together decide «the batch is done» one after the other. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from AiBatch b where b.id = :id")
    Optional<AiBatch> lockById(@Param("id") long id);
}
