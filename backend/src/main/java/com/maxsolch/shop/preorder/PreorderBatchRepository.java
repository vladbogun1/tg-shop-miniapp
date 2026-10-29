package com.maxsolch.shop.preorder;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PreorderBatchRepository extends JpaRepository<PreorderBatch, Long> {

    /** Row-locked read: arrival and cancellation must not run twice at once. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from PreorderBatch b where b.id = :id")
    Optional<PreorderBatch> findForUpdate(@Param("id") Long id);

    List<PreorderBatch> findByStatusInOrderByCreatedAtDesc(Collection<String> statuses);

    List<PreorderBatch> findAllByOrderByCreatedAtDesc();
}
