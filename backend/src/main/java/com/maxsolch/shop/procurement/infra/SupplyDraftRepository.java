package com.maxsolch.shop.procurement.infra;

import com.maxsolch.shop.procurement.domain.SupplyDraft;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SupplyDraftRepository extends JpaRepository<SupplyDraft, Long> {

    /** The ids the timer moves on, oldest first. */
    @Query("select d.id from SupplyDraft d where d.status = :status order by d.id")
    List<Long> idsByStatus(@Param("status") SupplyDraft.Status status);

    /** Open drafts (not accepted), newest first: all of them for the finance right, otherwise filtered by the caller. */
    List<SupplyDraft> findByStatusInOrderByIdDesc(Collection<SupplyDraft.Status> statuses);

    /** The row is locked until the transaction ends: the timer and the admin's actions change the draft one after the other. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from SupplyDraft d where d.id = :id")
    Optional<SupplyDraft> lockById(@Param("id") long id);
}
