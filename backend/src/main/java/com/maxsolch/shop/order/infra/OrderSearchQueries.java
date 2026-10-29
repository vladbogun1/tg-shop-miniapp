package com.maxsolch.shop.order.infra;

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

    /** Optional createdAt window [from, to): either bound may be null (the upper one comes from calendar periods). */
    static final String RANGE = "(:from is null or o.createdAt >= :from) and (:to is null or o.createdAt < :to) ";

    /**
     * Free-text match across the order's own fields and its item titles. {@code q} must already be
     * lowercased, LIKE-escaped with {@code !} and wrapped in {@code %...%} (see
     * {@link OrderSearchTerm}). {@code idLo}/{@code idHi} are set when the query looks like an
     * order number — the 8-character short id shown everywhere ({@code #5bf865c4}), any longer
     * prefix, or the full UUID — and match it as a range over the binary primary key, so it is an
     * index range scan rather than a hex() over every row.
     */
    static final String TEXT =
            "(:q is null or "
            + "  (:idLo is not null and o.id between :idLo and :idHi) "
            + "  or lower(o.customerName) like :q escape '!' "
            + "  or lower(o.phone) like :q escape '!' "
            + "  or lower(coalesce(o.trackingNumber, '')) like :q escape '!' "
            + "  or lower(coalesce(o.promoCode, '')) like :q escape '!' "
            + "  or lower(coalesce(o.npWarehouseName, '')) like :q escape '!' "
            + "  or lower(coalesce(o.npCityName, '')) like :q escape '!' "
            + "  or lower(coalesce(o.paymentOptionTitle, '')) like :q escape '!' "
            + "  or exists (select 1 from OrderItem it where it.order = o "
            + "             and lower(it.titleSnapshot) like :q escape '!')) ";

    /** Optional status filter (null = any status). */
    static final String ANY_STATUS = "(:status is null or o.status = :status) ";

    /** Exact status filter, for the per-column board queries. */
    static final String ONE_STATUS = "o.status = :status ";

    /** The table shows either the live orders (archived = false) or only the archive (V68). */
    static final String ARCHIVE = "((:archived = true and o.archivedAt is not null) "
            + "or (:archived = false and o.archivedAt is null)) ";

    /** The board never shows archived orders. */
    static final String LIVE = "o.archivedAt is null ";

    static final String WHERE_LIST = " where " + ANY_STATUS + "and " + ARCHIVE + "and " + RANGE + "and " + TEXT;

    /** A parcel on its way back to the shop (V68): the board's «Едет назад» column. */
    static final String RETURNING = "o.returnStatus = 'IN_TRANSIT' ";

    /**
     * A refused parcel travelling back sits only in «Едет назад» — none of it is «Отклонён» yet.
     * A partial return of a delivered order stays in «Доставлен» too: the rest of it is delivered.
     */
    static final String NOT_REFUSED_RETURNING = "not (o.status = com.maxsolch.shop.order.domain.OrderStatus.REJECTED "
            + "and coalesce(o.returnStatus, '') = 'IN_TRANSIT') ";

    static final String WHERE_COLUMN = " where " + ONE_STATUS + "and " + LIVE + "and " + NOT_REFUSED_RETURNING
            + "and " + RANGE + "and " + TEXT;

    /** Same filters as a board column, but across every status (for the grouped count query). */
    static final String WHERE_COLUMN_ALL_STATUSES = " where " + LIVE + "and " + NOT_REFUSED_RETURNING
            + "and " + RANGE + "and " + TEXT;

    /** «Едет назад»: never limited by the period — a parcel in transit is work to do. */
    static final String WHERE_RETURNING = " where " + RETURNING + "and " + LIVE + "and " + TEXT;
}
