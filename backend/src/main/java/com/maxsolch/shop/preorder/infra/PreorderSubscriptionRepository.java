package com.maxsolch.shop.preorder.infra;

import com.maxsolch.shop.preorder.domain.PreorderSubscription;
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

    /**
     * Holds (and «everybody at once» notices) past their deadline, as {@code [id, productId]} — no entities
     * on purpose: the job locks the product first and then re-reads the row with {@link #findForUpdate}, and a
     * managed copy loaded here would be served from the persistence context with its stale status.
     */
    @Query("select s.id, s.productId from PreorderSubscription s where s.status in ('HELD', 'NOTIFIED') "
            + "and s.holdUntil < :now order by s.holdUntil")
    List<Object[]> findExpiredHoldIds(@Param("now") Instant now, Pageable pageable);

    /** One place, row-locked and read from the latest committed data (a buyer or the job may just have closed it). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from PreorderSubscription s where s.id = :id")
    java.util.Optional<PreorderSubscription> findForUpdate(@Param("id") Long id);

    /** Live places of one customer on a line, row-locked: checkout must see what the expiry job just did. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from PreorderSubscription s where s.userId = :userId and " + SAME_LINE + " and " + LIVE)
    List<PreorderSubscription> lockLive(@Param("userId") Long userId, @Param("productId") byte[] productId,
                                        @Param("variantId") byte[] variantId);

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

    /** Distinct people waiting per product (any variant): {@code [productId, people, units]}. */
    @Query("select s.productId, count(distinct s.userId), sum(s.qty) from PreorderSubscription s "
            + "where s.status in ('WAITING', 'HELD') group by s.productId")
    List<Object[]> waitingByProduct();

    /** New subscriptions in [from, to): {@code [count, distinct people]}. */
    @Query("select count(s), count(distinct s.userId) from PreorderSubscription s "
            + "where s.createdAt >= :from and s.createdAt < :to")
    List<Object[]> joinedBetween(@Param("from") Instant from, @Param("to") Instant to);

    /**
     * Units handed out as holds in [from, to): the places whose {@code notifiedAt} falls in it and that
     * got units (not just a notice). {@code held_qty} is zeroed when a place closes, so a finished place is
     * counted by what it asked for ({@code qty}) — an approximation for partial holds.
     */
    @Query("select coalesce(sum(case when s.status = 'HELD' then s.heldQty else s.qty end), 0) "
            + "from PreorderSubscription s where s.notifiedAt >= :from and s.notifiedAt < :to "
            + "and s.status in ('HELD', 'BOUGHT', 'EXPIRED')")
    long holdUnitsGiven(@Param("from") Instant from, @Param("to") Instant to);

    /** Units of places that were held and then bought / ran out, closed in [from, to). */
    @Query("select coalesce(sum(s.qty), 0) from PreorderSubscription s where s.status = :status "
            + "and s.notifiedAt is not null and s.closedAt >= :from and s.closedAt < :to")
    long closedAfterHold(@Param("status") String status, @Param("from") Instant from, @Param("to") Instant to);

    /** Live places created in [from, to): digest. {@code [productId, count, distinct people]} per product. */
    @Query("select s.productId, count(s), count(distinct s.userId) from PreorderSubscription s "
            + "where s.createdAt >= :from and s.createdAt < :to group by s.productId order by count(s) desc")
    List<Object[]> joinedByProduct(@Param("from") Instant from, @Param("to") Instant to);
}
