package com.maxsolch.shop.repository;

/**
 * The order-search predicate, written once.
 *
 * <p>It was copy-pasted into four places in {@link OrderRepository} (the list query, its count
 * query, the board column query and the board count query), so adding a searchable field meant
 * editing the same twelve lines four times — and forgetting one silently made the table and the
 * board disagree about what matches.
 *
 * <p>These are {@code static final String} constants, so concatenating them inside a
 * {@code @Query} annotation still yields a compile-time constant.
 */
final class OrderSearchQueries {

    private OrderSearchQueries() {
    }

    /** Optional lower bound on createdAt. */
    static final String RANGE = "(:from is null or o.createdAt >= :from) ";

    /**
     * Free-text match across the order's own fields and its item titles. {@code q} must already be
     * lowercased and wrapped in {@code %...%}; {@code idKey} is set when {@code q} parses as a UUID
     * so searching by order id works.
     */
    static final String TEXT =
            "(:q is null or "
            + "  (:idKey is not null and o.id = :idKey) "
            + "  or lower(o.customerName) like :q "
            + "  or lower(o.phone) like :q "
            + "  or lower(coalesce(o.trackingNumber, '')) like :q "
            + "  or lower(coalesce(o.promoCode, '')) like :q "
            + "  or lower(coalesce(o.npWarehouseName, '')) like :q "
            + "  or lower(coalesce(o.npCityName, '')) like :q "
            + "  or lower(coalesce(o.paymentOptionTitle, '')) like :q "
            + "  or exists (select 1 from OrderItem it where it.order = o "
            + "             and lower(it.titleSnapshot) like :q)) ";

    /** Optional status filter (null = any status). */
    static final String ANY_STATUS = "(:status is null or o.status = :status) ";

    /** Exact status filter, for the per-column board queries. */
    static final String ONE_STATUS = "o.status = :status ";

    static final String WHERE_LIST = " where " + ANY_STATUS + "and " + RANGE + "and " + TEXT;

    static final String WHERE_COLUMN = " where " + ONE_STATUS + "and " + RANGE + "and " + TEXT;

    /** Same filters as a board column, but across every status (for the grouped count query). */
    static final String WHERE_COLUMN_ALL_STATUSES = " where " + RANGE + "and " + TEXT;
}
