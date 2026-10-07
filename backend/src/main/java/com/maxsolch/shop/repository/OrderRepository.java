package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, byte[]> {

    List<Order> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Order> findByTgUserIdOrderByCreatedAtDesc(Long tgUserId);

    List<Order> findByStatusOrderByCreatedAtDesc(OrderStatus status);

    List<Order> findAllByOrderByCreatedAtDesc();

    /**
     * Loads the order and takes its row lock ({@code SELECT ... FOR UPDATE}) until the transaction
     * ends. Every state change of an order goes through this, so two of them (a customer cancelling
     * while an admin rejects, two admin tabs) run one after the other instead of both seeing
     * {@code NEW} and both returning the stock. Lock order is always order row, then product rows.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") byte[] id);

    /** Orders of one status with their items, for work done outside a transaction (dispatch sync). */
    @Query("select distinct o from Order o left join fetch o.items where o.status = :status "
            + "order by o.createdAt desc")
    List<Order> findWithItemsByStatus(@Param("status") OrderStatus status);

    /** One order with its lines (online payment builds the basket outside a transaction). */
    @Query("select distinct o from Order o left join fetch o.items where o.id = :id")
    Optional<Order> findWithItemsById(@Param("id") byte[] id);

    /** Unpaid orders whose online payment deadline has passed (auto-cancel candidates). */
    @Query("select o.id from Order o where o.status = com.maxsolch.shop.domain.OrderStatus.NEW "
            + "and o.paid = false and o.receivedMinor = 0 "
            + "and o.paymentDueAt is not null and o.paymentDueAt < :now")
    List<byte[]> findOverdueUnpaidIds(@Param("now") java.time.Instant now);

    /** Writes back the dispatch card's message id in its own short transaction. */
    @Transactional
    @Modifying
    @Query("update Order o set o.dispatchMessageId = :messageId where o.id = :id")
    int updateDispatchMessageId(@Param("id") byte[] id, @Param("messageId") Integer messageId);

    /**
     * Smart, paged search for the order table. The predicate itself lives in
     * {@link OrderSearchQueries} so the list, its count, and the two board queries below cannot
     * drift apart.
     */
    @Query(value = "select o from Order o" + OrderSearchQueries.WHERE_LIST,
            countQuery = "select count(o) from Order o" + OrderSearchQueries.WHERE_LIST)
    Page<Order> search(@Param("status") OrderStatus status,
                       @Param("q") String q,
                       @Param("idLo") byte[] idLo,
                       @Param("idHi") byte[] idHi,
                       @Param("from") Instant from,
                       Pageable pageable);

    /**
     * Board column query: the same predicate scoped to a single status and paged, so the caller can
     * cap how many cards a column renders.
     */
    @Query("select o from Order o" + OrderSearchQueries.WHERE_COLUMN + "order by o.createdAt desc")
    List<Order> searchByStatus(@Param("status") OrderStatus status,
                               @Param("q") String q,
                               @Param("idLo") byte[] idLo,
                       @Param("idHi") byte[] idHi,
                               @Param("from") Instant from,
                               Pageable pageable);

    /**
     * Per-status count AND money total for the board columns in one query: rows of
     * {@code [status, count, sum(totalMinor)]}. The column sum used to be added up on the client
     * from the (capped) cards it had loaded.
     */
    @Query("select o.status, count(o), coalesce(sum(o.totalMinor), 0) from Order o"
            + OrderSearchQueries.WHERE_COLUMN_ALL_STATUSES + "group by o.status")
    List<Object[]> statsByStatus(@Param("q") String q,
                                 @Param("idLo") byte[] idLo,
                                 @Param("idHi") byte[] idHi,
                                 @Param("from") Instant from);
}
