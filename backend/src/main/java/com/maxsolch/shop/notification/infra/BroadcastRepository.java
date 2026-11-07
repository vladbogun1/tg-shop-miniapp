package com.maxsolch.shop.notification.infra;

import com.maxsolch.shop.notification.domain.Broadcast;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface BroadcastRepository extends JpaRepository<Broadcast, Long> {

    @Query("SELECT b FROM Broadcast b ORDER BY b.startedAt DESC, b.id DESC")
    List<Broadcast> recent(Pageable pageable);

    long countByAdminId(Long adminId);

    /** On startup: a RUNNING row can only be left over from a restart mid-send. */
    @Modifying
    @Query("UPDATE Broadcast b SET b.status = 'INTERRUPTED' WHERE b.status = 'RUNNING'")
    int markInterrupted();

    /** The broadcast that is sending now (one at a time; restarts close leftovers as INTERRUPTED). */
    Optional<Broadcast> findFirstByStatusOrderByIdDesc(String status);

    boolean existsByIdAndStopRequestedAtIsNotNull(Long id);

    @Query("SELECT b.stoppedByName FROM Broadcast b WHERE b.id = :id")
    String stoppedByName(@Param("id") Long id);

    /** Sets the stop flag once: 1 = this call stopped it, 0 = already requested or not running (idempotent). */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE Broadcast b SET b.stopRequestedAt = :at, b.stoppedById = :adminId, b.stoppedByName = :adminName "
            + "WHERE b.id = :id AND b.status = 'RUNNING' AND b.stopRequestedAt IS NULL")
    int requestStop(@Param("id") Long id, @Param("at") Instant at, @Param("adminId") Long adminId,
                    @Param("adminName") String adminName);
}
