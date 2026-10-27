package com.maxsolch.shop.preorder;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Pre-order queues. A «line» is a product plus an optional variant; {@code variantId} null means the
 * product has no variants, so every query matches it with {@code is null} explicitly.
 */
public interface PreorderSubscriptionRepository extends JpaRepository<PreorderSubscription, Long> {

    String SAME_LINE = "s.productId = :productId and ((:variantId is null and s.variantId is null) "
            + "or s.variantId = :variantId)";

    String LIVE = "s.status in ('WAITING', 'HELD', 'NOTIFIED')";

    @Query("select s from PreorderSubscription s where s.userId = :userId and " + SAME_LINE + " and " + LIVE)
    List<PreorderSubscription> findLive(@Param("userId") Long userId, @Param("productId") byte[] productId,
                                        @Param("variantId") byte[] variantId);

    /** The whole live queue of a line, in order, row-locked: hold hand-out must be serialised. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from PreorderSubscription s where " + SAME_LINE + " and " + LIVE
            + " order by s.createdAt asc, s.id asc")
    List<PreorderSubscription> lockQueue(@Param("productId") byte[] productId, @Param("variantId") byte[] variantId);

    @Query("select s from PreorderSubscription s where " + SAME_LINE + " and " + LIVE
            + " order by s.createdAt asc, s.id asc")
    List<PreorderSubscription> queue(@Param("productId") byte[] productId, @Param("variantId") byte[] variantId);

    /** Units kept for other people: invisible to this customer's checkout. */
    @Query("select coalesce(sum(s.heldQty), 0) from PreorderSubscription s where " + SAME_LINE
            + " and s.status = 'HELD' and (:userId is null or s.userId <> :userId)")
    long heldForOthers(@Param("productId") byte[] productId, @Param("variantId") byte[] variantId,
                       @Param("userId") Long userId);

    /** People waiting for a product (any variant) — «Чекають N людей». */
    @Query("select count(distinct s.userId) from PreorderSubscription s where s.productId = :productId and "
            + "s.status in ('WAITING', 'HELD')")
    long countPeople(@Param("productId") byte[] productId);

    /** Units on hold per line, {@code [productId, variantId, held]} — the catalog shows the rest. */
    @Query("select s.productId, s.variantId, sum(s.heldQty) from PreorderSubscription s where s.status = 'HELD' "
            + "and s.heldQty > 0 group by s.productId, s.variantId")
    List<Object[]> heldByLine();

    /** Waiting before this subscription in its queue (its place = this + 1). */
    @Query("select count(s) from PreorderSubscription s where " + SAME_LINE + " and s.status = 'WAITING' "
            + "and (s.createdAt < :createdAt or (s.createdAt = :createdAt and s.id < :id))")
    long countAhead(@Param("productId") byte[] productId, @Param("variantId") byte[] variantId,
                    @Param("createdAt") Instant createdAt, @Param("id") Long id);

    long countByUserIdAndStatusIn(Long userId, Collection<String> statuses);

    List<PreorderSubscription> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    List<PreorderSubscription> findByUserIdAndStatusIn(Long userId, Collection<String> statuses);

    /** Holds (and «everybody at once» notices) past their deadline. */
    @Query("select s from PreorderSubscription s where s.status in ('HELD', 'NOTIFIED') and s.holdUntil < :now "
            + "order by s.holdUntil")
    List<PreorderSubscription> findExpiredHolds(@Param("now") Instant now, Pageable pageable);

    /** Holds ending before {@code before} that have not been reminded of yet. */
    @Query("select s from PreorderSubscription s where s.status = 'HELD' and s.remindedAt is null "
            + "and s.holdUntil > :now and s.holdUntil <= :before order by s.holdUntil")
    List<PreorderSubscription> findHoldsToRemind(@Param("now") Instant now, @Param("before") Instant before,
                                                 Pageable pageable);

    /**
     * Demand («Чего ждут»): per line — people, units, first joined, joined since {@code since}. Each row is
     * {@code [productId, variantId, people, units, firstAt, newSince]}.
     */
    @Query("select s.productId, s.variantId, count(s), sum(s.qty), min(s.createdAt), "
            + "sum(case when s.createdAt >= :since then 1 else 0 end) "
            + "from PreorderSubscription s where s.status in ('WAITING', 'HELD') "
            + "group by s.productId, s.variantId order by count(s) desc, min(s.createdAt) asc")
    List<Object[]> demand(@Param("since") Instant since);

    /** Live rows of a product (all variants) — for the admin list and for closing them. */
    @Query("select s from PreorderSubscription s where s.productId = :productId and " + LIVE
            + " order by s.createdAt asc, s.id asc")
    List<PreorderSubscription> findLiveByProduct(@Param("productId") byte[] productId);
}
