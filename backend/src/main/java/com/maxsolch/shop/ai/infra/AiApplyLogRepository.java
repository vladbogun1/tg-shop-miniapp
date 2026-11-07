package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiApplyLog;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AiApplyLogRepository extends JpaRepository<AiApplyLog, Long> {

    List<AiApplyLog> findByBatchIdOrderByIdAsc(long batchId);

    List<AiApplyLog> findByJobIdOrderByIdDesc(long jobId);

    boolean existsByJobId(long jobId);

    /** Locked until the transaction ends: two clicks on «Отменить применение» undo once. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from AiApplyLog l where l.id = :id")
    Optional<AiApplyLog> lockById(@Param("id") long id);
}
