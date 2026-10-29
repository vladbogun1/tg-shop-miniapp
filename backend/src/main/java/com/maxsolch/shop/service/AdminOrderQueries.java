package com.maxsolch.shop.service;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.OrderSearchTerm;
import com.maxsolch.shop.platform.error.NotFoundException;
import com.maxsolch.shop.web.dto.OrderBoardDto;
import com.maxsolch.shop.web.dto.OrderCardDto;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the admin panel reads about orders: the kanban board, the table, one customer's orders and
 * the lookup of a single order by the id in the URL.
 *
 * <p>Read-only and deliberately not {@code @Transactional}: it runs inside the request, like the
 * controller code it was taken from, and the card mapping ({@link OrderQueryService}) is what
 * touches lazy collections.
 */
@Service
public class AdminOrderQueries {

    /** Board column key of the parcels on their way back (not an {@link OrderStatus}). */
    static final String RETURNING_COLUMN = "RETURNING";

    /** Per-status column cap on the board so we never load all 10k orders. */
    private static final int BOARD_COLUMN_LIMIT = 300;

    /** Whitelist of sortable list columns -> Order entity property names. */
    private static final Map<String, String> SORTABLE = Map.of(
            "createdAt", "createdAt",
            "totalMinor", "totalMinor",
            "customerName", "customerName",
            "status", "status");

    private final OrderRepository orderRepository;
    private final OrderQueryService orderQueryService;

    public AdminOrderQueries(OrderRepository orderRepository, OrderQueryService orderQueryService) {
        this.orderRepository = orderRepository;
        this.orderQueryService = orderQueryService;
    }

    /** The order of the {@code /api/admin/orders/{id}} URL; 404 for a malformed or unknown id. */
    public Order load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("заказ не найден");
        }
        return orderRepository.findById(key).orElseThrow(() -> new NotFoundException("заказ не найден"));
    }

    /**
     * Kanban board grouped by status (q filtered, newest first, capped). The window applies to the
     * closed columns (DELIVERED / REJECTED) only; {@code closedLimit} caps those columns. The caller
     * cuts the window (the shop's timezone is its business, not this class's).
     */
    public OrderBoardDto board(String q, OrderWindow w, Integer closedLimit) {
        OrderSearchTerm term = OrderSearchTerm.parse(q);
        int closedCap = closedLimit == null
                ? BOARD_COLUMN_LIMIT
                : Math.min(Math.max(1, closedLimit), BOARD_COLUMN_LIMIT);

        // Fetch every column first, then map them together: the unread and item counts come from
        // two grouped queries for the whole board instead of two per card (5 columns x 300 cards
        // used to mean ~3000 queries on every 10-second refresh).
        // Active orders are never hidden by the period: a parcel stuck at Nova Poshta for five
        // weeks used to drop off the board when "Месяц" was selected.
        Map<String, List<Order>> byStatus = new LinkedHashMap<>();
        List<Order> all = new ArrayList<>();
        for (OrderStatus status : OrderStatus.values()) {
            boolean closed = isClosed(status);
            List<Order> orders = orderRepository.searchByStatus(status, term.like(), term.idLo(), term.idHi(),
                    closed ? w.from() : null, closed ? w.to() : null, PageRequest.of(0, closed ? closedCap : BOARD_COLUMN_LIMIT));
            byStatus.put(status.name(), orders);
            all.addAll(orders);
        }
        // «Едет назад» is not a status: a refused parcel (REJECTED) or the returned part of a
        // delivered order travelling back — a column of its own until «Посылка вернулась».
        List<Order> returning = orderRepository.searchReturning(term.like(), term.idLo(), term.idHi(),
                PageRequest.of(0, BOARD_COLUMN_LIMIT));
        byStatus.put(RETURNING_COLUMN, returning);
        List<Order> withReturning = new ArrayList<>(all);
        withReturning.addAll(returning);
        OrderQueryService.CardContext ctx =
                orderQueryService.cardContext(withReturning, SenderType.CUSTOMER);

        Map<String, List<OrderCardDto>> columns = new LinkedHashMap<>();
        byStatus.forEach((status, orders) ->
                columns.put(status, orders.stream().map(o -> orderQueryService.toCard(o, ctx)).toList()));

        // True per-column totals and money sums in one grouped query per time window.
        Map<String, Long> counts = new LinkedHashMap<>();
        Map<String, Long> sums = new LinkedHashMap<>();
        for (OrderStatus status : OrderStatus.values()) {
            counts.put(status.name(), 0L);
            sums.put(status.name(), 0L);
        }
        List<Object[]> allTime = orderRepository.statsByStatus(term.like(), term.idLo(), term.idHi(), null, null);
        List<Object[]> ranged = w.unbounded() ? allTime
                : orderRepository.statsByStatus(term.like(), term.idLo(), term.idHi(), w.from(), w.to());
        putStats(allTime, false, counts, sums);
        putStats(ranged, true, counts, sums);
        counts.put(RETURNING_COLUMN, orderRepository.countReturning(term.like(), term.idLo(), term.idHi()));
        return new OrderBoardDto(columns, counts, sums);
    }

    /** DELIVERED / REJECTED: the only columns the period and the short cap apply to. */
    private static boolean isClosed(OrderStatus status) {
        return status == OrderStatus.DELIVERED || status == OrderStatus.REJECTED;
    }

    private static void putStats(List<Object[]> rows, boolean closed,
                                 Map<String, Long> counts, Map<String, Long> sums) {
        for (Object[] row : rows) {
            OrderStatus status = (OrderStatus) row[0];
            if (isClosed(status) != closed) {
                continue;
            }
            counts.put(status.name(), ((Number) row[1]).longValue());
            sums.put(status.name(), row[2] == null ? 0L : ((Number) row[2]).longValue());
        }
    }

    /** All orders of a single user, newest first — for the Users profile. */
    public List<OrderCardDto> byUser(long telegramUserId) {
        return orderQueryService.toCards(
                orderRepository.findByTgUserIdOrderByCreatedAtDesc(telegramUserId),
                SenderType.CUSTOMER);
    }

    /** One page of the order table. {@code archived} picks the archive instead of the live orders. */
    public List<OrderCardDto> list(OrderStatus statusFilter, String q, OrderWindow w,
                                   int page, int size, String sortBy, String sortDir, boolean archived) {
        OrderSearchTerm term = OrderSearchTerm.parse(q);
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 200),
                sortOf(sortBy, sortDir));
        return orderQueryService.toCards(
                orderRepository.search(statusFilter, archived, term.like(), term.idLo(), term.idHi(), w.from(), w.to(), pageable).getContent(),
                SenderType.CUSTOMER);
    }

    /** Whitelisted sort, falling back to {@code createdAt desc} for unknown fields/directions. */
    private static Sort sortOf(String sortBy, String sortDir) {
        String property = SORTABLE.getOrDefault(sortBy, "createdAt");
        Sort.Direction direction = "asc".equalsIgnoreCase(sortDir)
                ? Sort.Direction.ASC
                : Sort.Direction.DESC;
        return Sort.by(direction, property);
    }
}
