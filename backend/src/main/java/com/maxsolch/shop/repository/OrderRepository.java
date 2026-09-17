package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.service.MetricsRow;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface OrderRepository extends JpaRepository<Order, byte[]> {

    List<Order> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Order> findByTgUserIdOrderByCreatedAtDesc(Long tgUserId);

    List<Order> findByStatusOrderByCreatedAtDesc(OrderStatus status);

    List<Order> findAllByOrderByCreatedAtDesc();

    /**
     * Smart, paged search for the order table. The predicate itself lives in
     * {@link OrderSearchQueries} so the list, its count, and the two board queries below cannot
     * drift apart.
     */
    @Query(value = "select o from Order o" + OrderSearchQueries.WHERE_LIST,
            countQuery = "select count(o) from Order o" + OrderSearchQueries.WHERE_LIST)
    Page<Order> search(@Param("status") OrderStatus status,
                       @Param("q") String q,
                       @Param("idKey") byte[] idKey,
                       @Param("from") Instant from,
                       Pageable pageable);

    /**
     * Board column query: the same predicate scoped to a single status and paged, so the caller can
     * cap how many cards a column renders.
     */
    @Query("select o from Order o" + OrderSearchQueries.WHERE_COLUMN + "order by o.createdAt desc")
    List<Order> searchByStatus(@Param("status") OrderStatus status,
                               @Param("q") String q,
                               @Param("idKey") byte[] idKey,
                               @Param("from") Instant from,
                               Pageable pageable);

    /**
     * True count for one status — unbounded by the page cap, so a column can report "12 of 300"
     * honestly.
     */
    @Query("select count(o) from Order o" + OrderSearchQueries.WHERE_COLUMN)
    long countByStatusSearch(@Param("status") OrderStatus status,
                             @Param("q") String q,
                             @Param("idKey") byte[] idKey,
                             @Param("from") Instant from);

    /**
     * Per-status counts for every column in ONE query. The board used to issue a separate COUNT per
     * status on every poll.
     */
    @Query("select o.status, count(o) from Order o" + OrderSearchQueries.WHERE_COLUMN_ALL_STATUSES
            + "group by o.status")
    List<Object[]> countsByStatus(@Param("q") String q,
                                  @Param("idKey") byte[] idKey,
                                  @Param("from") Instant from);

    /**
     * Range-bounded analytics rows. Returns a flat projection rather than entities: the dashboard
     * polls frequently and only needs these columns, so there is no reason to hydrate orders (and,
     * previously, to lazily fetch each one's items — one extra query per order).
     */
    @Query("select new com.maxsolch.shop.service.MetricsRow("
            + "o.status, o.totalMinor, o.currency, o.deliveryMethod, o.paymentOptionTitle, "
            + "o.createdAt, o.approvedAt, o.shippedAt, o.deliveredAt) "
            + "from Order o where (:from is null or o.createdAt >= :from) order by o.createdAt asc")
    List<MetricsRow> findMetricsRows(@Param("from") Instant from);
}
