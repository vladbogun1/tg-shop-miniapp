package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
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
     * Smart, paged search for the order table. Matches {@code q} case-insensitively across the
     * order's own text fields and its item product titles (via EXISTS on items). {@code from} is an
     * optional lower bound on createdAt. {@code idKey} is an optional exact binary order-id match
     * (set by the service when {@code q} parses as a UUID) so callers can search by order id.
     * {@code q} must already be lowercased and wrapped in {@code %...%}.
     */
    @Query(value = "select o from Order o where "
            + "(:status is null or o.status = :status) "
            + "and (:from is null or o.createdAt >= :from) "
            + "and (:q is null or "
            + "  (:idKey is not null and o.id = :idKey) "
            + "  or lower(o.customerName) like :q "
            + "  or lower(o.phone) like :q "
            + "  or lower(coalesce(o.trackingNumber, '')) like :q "
            + "  or lower(coalesce(o.promoCode, '')) like :q "
            + "  or lower(coalesce(o.npWarehouseName, '')) like :q "
            + "  or lower(coalesce(o.npCityName, '')) like :q "
            + "  or lower(coalesce(o.paymentOptionTitle, '')) like :q "
            + "  or exists (select 1 from OrderItem it where it.order = o "
            + "             and lower(it.titleSnapshot) like :q))",
            countQuery = "select count(o) from Order o where "
            + "(:status is null or o.status = :status) "
            + "and (:from is null or o.createdAt >= :from) "
            + "and (:q is null or "
            + "  (:idKey is not null and o.id = :idKey) "
            + "  or lower(o.customerName) like :q "
            + "  or lower(o.phone) like :q "
            + "  or lower(coalesce(o.trackingNumber, '')) like :q "
            + "  or lower(coalesce(o.promoCode, '')) like :q "
            + "  or lower(coalesce(o.npWarehouseName, '')) like :q "
            + "  or lower(coalesce(o.npCityName, '')) like :q "
            + "  or lower(coalesce(o.paymentOptionTitle, '')) like :q "
            + "  or exists (select 1 from OrderItem it where it.order = o "
            + "             and lower(it.titleSnapshot) like :q))")
    Page<Order> search(@Param("status") OrderStatus status,
                       @Param("q") String q,
                       @Param("idKey") byte[] idKey,
                       @Param("from") Instant from,
                       Pageable pageable);

    /**
     * Board column query: same smart-search predicate but scoped to a single status and paged so the
     * caller can cap each column. {@code q} may be null for no text filter.
     */
    @Query("select o from Order o where o.status = :status "
            + "and (:from is null or o.createdAt >= :from) "
            + "and (:q is null or "
            + "  (:idKey is not null and o.id = :idKey) "
            + "  or lower(o.customerName) like :q "
            + "  or lower(o.phone) like :q "
            + "  or lower(coalesce(o.trackingNumber, '')) like :q "
            + "  or lower(coalesce(o.promoCode, '')) like :q "
            + "  or lower(coalesce(o.npWarehouseName, '')) like :q "
            + "  or lower(coalesce(o.npCityName, '')) like :q "
            + "  or lower(coalesce(o.paymentOptionTitle, '')) like :q "
            + "  or exists (select 1 from OrderItem it where it.order = o "
            + "             and lower(it.titleSnapshot) like :q)) "
            + "order by o.createdAt desc")
    List<Order> searchByStatus(@Param("status") OrderStatus status,
                               @Param("q") String q,
                               @Param("idKey") byte[] idKey,
                               @Param("from") Instant from,
                               Pageable pageable);

    /**
     * True count of orders for a single status using the same smart-search predicate as
     * {@link #searchByStatus}, but unbounded by any page cap. Used by the board to report accurate
     * per-column totals even when the visible cards are capped.
     */
    @Query("select count(o) from Order o where o.status = :status "
            + "and (:from is null or o.createdAt >= :from) "
            + "and (:q is null or "
            + "  (:idKey is not null and o.id = :idKey) "
            + "  or lower(o.customerName) like :q "
            + "  or lower(o.phone) like :q "
            + "  or lower(coalesce(o.trackingNumber, '')) like :q "
            + "  or lower(coalesce(o.promoCode, '')) like :q "
            + "  or lower(coalesce(o.npWarehouseName, '')) like :q "
            + "  or lower(coalesce(o.npCityName, '')) like :q "
            + "  or lower(coalesce(o.paymentOptionTitle, '')) like :q "
            + "  or exists (select 1 from OrderItem it where it.order = o "
            + "             and lower(it.titleSnapshot) like :q))")
    long countByStatusSearch(@Param("status") OrderStatus status,
                             @Param("q") String q,
                             @Param("idKey") byte[] idKey,
                             @Param("from") Instant from);

    /**
     * Range-bounded fetch for analytics. Items are accessed lazily inside the metrics transaction.
     */
    @Query("select o from Order o where (:from is null or o.createdAt >= :from) order by o.createdAt asc")
    List<Order> findForMetrics(@Param("from") Instant from);
}
