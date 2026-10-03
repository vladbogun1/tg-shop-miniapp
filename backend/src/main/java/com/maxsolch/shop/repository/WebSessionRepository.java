package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.WebSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface WebSessionRepository extends JpaRepository<WebSession, byte[]> {

    /** Row lock for refresh rotation: two concurrent refreshes must not both rotate. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from WebSession s where s.id = :id")
    Optional<WebSession> findByIdForUpdate(@Param("id") byte[] id);

    @Query("select s from WebSession s where s.userId = :userId and s.revokedAt is null "
            + "and s.expiresAt > :now order by s.lastUsedAt desc")
    List<WebSession> findActiveByUser(@Param("userId") long userId, @Param("now") Instant now);

    @Modifying
    @Query("update WebSession s set s.revokedAt = :now where s.userId = :userId and s.revokedAt is null")
    int revokeAllForUser(@Param("userId") long userId, @Param("now") Instant now);

    /** Expired sessions, and revoked ones once nobody needs to see them in the list any more. */
    @Modifying
    @Query("delete from WebSession s where s.expiresAt < :now or s.revokedAt < :revokedBefore")
    int deleteStale(@Param("now") Instant now, @Param("revokedBefore") Instant revokedBefore);
}
