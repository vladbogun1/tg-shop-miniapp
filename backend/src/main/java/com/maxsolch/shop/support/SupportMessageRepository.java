package com.maxsolch.shop.support;

import com.maxsolch.shop.domain.SenderType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface SupportMessageRepository extends JpaRepository<SupportMessage, Long> {

    /** Newest page of a thread, optionally everything before a message id (the service flips it). */
    @Query("select m from SupportMessage m where m.threadId = :threadId "
            + "and (:beforeId is null or m.id < :beforeId) order by m.id desc")
    List<SupportMessage> findPage(@Param("threadId") byte[] threadId,
                                  @Param("beforeId") Long beforeId,
                                  Pageable pageable);

    /** Messages of this sender since {@code since}, across all threads (hourly limit). */
    @Query("select count(m) from SupportMessage m where m.senderType = :sender and m.senderId = :userId "
            + "and m.createdAt >= :since")
    long countSentSince(@Param("sender") SenderType sender, @Param("userId") Long userId,
                        @Param("since") Instant since);

    /** When this sender last wrote to support (cooldown); null = never. */
    @Query("select max(m.createdAt) from SupportMessage m where m.senderType = :sender and m.senderId = :userId")
    Instant lastSentAt(@Param("sender") SenderType sender, @Param("userId") Long userId);

    // clear/flush so the persistence context does not keep serving pre-update copies of these rows.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update SupportMessage m set m.readAt = :now "
            + "where m.threadId = :threadId and m.senderType = :senderType and m.readAt is null")
    int markRead(@Param("threadId") byte[] threadId, @Param("senderType") SenderType senderType,
                 @Param("now") Instant now);
}
