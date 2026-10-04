package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Broadcast;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface BroadcastRepository extends JpaRepository<Broadcast, Long> {

    @Query("SELECT b FROM Broadcast b ORDER BY b.startedAt DESC, b.id DESC")
    List<Broadcast> recent(Pageable pageable);

    /** On startup: a RUNNING row can only be left over from a restart mid-send. */
    @Modifying
    @Transactional
    @Query("UPDATE Broadcast b SET b.status = 'INTERRUPTED' WHERE b.status = 'RUNNING'")
    int markInterrupted();
}
