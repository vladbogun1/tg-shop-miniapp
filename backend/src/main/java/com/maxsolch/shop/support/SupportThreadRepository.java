package com.maxsolch.shop.support;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface SupportThreadRepository extends JpaRepository<SupportThread, byte[]> {

    List<SupportThread> findTop100ByUserIdOrderByLastMessageAtDesc(Long userId);

    /** Row-locked read for a write: counters and status change under concurrent messages. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from SupportThread t where t.id = :id")
    Optional<SupportThread> findForUpdate(@Param("id") byte[] id);

    long countByUserIdAndStatus(Long userId, SupportStatus status);

    /** The customer's open threads about this product, newest first. */
    @Query("select t from SupportThread t where t.userId = :userId and t.productId = :productId "
            + "and t.status = com.maxsolch.shop.support.SupportStatus.OPEN order by t.lastMessageAt desc")
    List<SupportThread> findOpenForProduct(@Param("userId") Long userId, @Param("productId") byte[] productId,
                                           Pageable pageable);

    /** The customer's open thread about this product, if any — a second question goes there. */
    default Optional<SupportThread> findOpenForProduct(Long userId, byte[] productId) {
        return findOpenForProduct(userId, productId, PageRequest.of(0, 1)).stream().findFirst();
    }

    /**
     * Admin list. {@code status} null = all; {@code awaiting} = only threads waiting for a shop
     * answer; {@code q} (lower-cased with % around, may be null) matches the customer name or the
     * product title.
     */
    @Query("select t from SupportThread t where (:status is null or t.status = :status) "
            + "and (:awaiting = false or t.awaitingSince is not null) "
            + "and (:q is null or lower(t.customerName) like :q or lower(t.productTitle) like :q) "
            + "order by t.lastMessageAt desc")
    List<SupportThread> adminList(@Param("status") SupportStatus status,
                                  @Param("awaiting") boolean awaiting,
                                  @Param("q") String q,
                                  Pageable pageable);

    /** Open threads whose customer waits for an answer, longest wait first («Внимание»). */
    @Query("select t from SupportThread t where t.status = com.maxsolch.shop.support.SupportStatus.OPEN "
            + "and t.awaitingSince is not null order by t.awaitingSince asc")
    List<SupportThread> findAwaiting(Pageable pageable);

    /** Admin nav badge: open threads waiting for an answer. */
    @Query("select count(t) from SupportThread t where t.status = com.maxsolch.shop.support.SupportStatus.OPEN "
            + "and t.awaitingSince is not null")
    long countAwaiting();

    /** Customer badge: unread shop messages across all of their threads. */
    @Query("select coalesce(sum(t.customerUnread), 0) from SupportThread t where t.userId = :userId")
    long sumCustomerUnread(@Param("userId") Long userId);

    /**
     * Open threads with no activity since {@code cutoff} and nobody waiting for the shop: the
     * auto-close candidates. A question the shop never answered is not closed behind its back —
     * it stays on «Внимание» until someone replies.
     */
    @Query("select t from SupportThread t where t.status = com.maxsolch.shop.support.SupportStatus.OPEN "
            + "and t.lastMessageAt < :cutoff and t.awaitingSince is null")
    List<SupportThread> findInactive(@Param("cutoff") Instant cutoff, Pageable pageable);
}
