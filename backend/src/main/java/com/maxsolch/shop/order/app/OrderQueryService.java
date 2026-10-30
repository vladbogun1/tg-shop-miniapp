package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderPaymentState;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.order.infra.OrderItemRepository;
import com.maxsolch.shop.order.infra.OrderMessageRepository;
import com.maxsolch.shop.order.infra.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-side mapping for orders (summaries / detail / board cards).
 *
 * <p>List endpoints take a {@link CardContext}: the unread counts, item counts and thumbnails for
 * the whole page, fetched in three grouped queries up front. Building them per card is what made
 * the admin board issue thousands of queries per refresh.
 */
@Service
public class OrderQueryService {

    private final OrderRepository orderRepository;
    private final OrderMessageRepository messageRepository;
    private final OrderItemRepository orderItemRepository;
    private final OrderThumbnails thumbnails;
    /** The order page itself (customer and admin views). */
    private final OrderDetailView detailView;

    public OrderQueryService(OrderRepository orderRepository,
                             OrderMessageRepository messageRepository,
                             OrderItemRepository orderItemRepository,
                             OrderThumbnails thumbnails,
                             OrderDetailView detailView) {
        this.orderRepository = orderRepository;
        this.messageRepository = messageRepository;
        this.orderItemRepository = orderItemRepository;
        this.thumbnails = thumbnails;
        this.detailView = detailView;
    }

    /**
     * Pre-fetched per-order numbers for a page of cards.
     *
     * @param unread     order id (UUID string) → unread messages from the other side
     * @param itemCounts order id (UUID string) → total units in the order
     */
    public record CardContext(Map<String, Long> unread, Map<String, Integer> itemCounts,
                              Map<String, List<OrderCardDto.CardLine>> lines,
                              Map<String, List<String>> exchangeChildren) {

        static CardContext empty() {
            return new CardContext(Map.of(), Map.of(), Map.of(), Map.of());
        }

        List<String> exchangesOf(String orderId) {
            return exchangeChildren.getOrDefault(orderId, List.of());
        }

        List<OrderCardDto.CardLine> linesFor(String orderId) {
            return lines.getOrDefault(orderId, List.of());
        }

        long unreadFor(String orderId) {
            return unread.getOrDefault(orderId, 0L);
        }

        int itemsFor(String orderId) {
            return itemCounts.getOrDefault(orderId, 0);
        }
    }

    /**
     * Builds the context for a page of orders: two grouped queries regardless of page size.
     *
     * @param unreadFrom whose unread messages to count — CUSTOMER for the admin views, ADMIN for
     *                   the customer's own order list
     */
    @Transactional(readOnly = true)
    public CardContext cardContext(List<Order> orders, SenderType unreadFrom) {
        if (orders.isEmpty()) {
            return CardContext.empty();
        }
        List<byte[]> ids = orders.stream().map(Order::getId).toList();

        Map<String, Long> unread = new HashMap<>();
        for (Object[] row : messageRepository.unreadCountsBySender(unreadFrom)) {
            unread.put(UuidUtil.toString((byte[]) row[0]), ((Number) row[1]).longValue());
        }

        Map<String, Integer> itemCounts = new HashMap<>();
        for (Object[] row : orderItemRepository.itemCountsByOrder(ids)) {
            itemCounts.put(UuidUtil.toString((byte[]) row[0]), ((Number) row[1]).intValue());
        }
        boolean admin = unreadFrom == SenderType.CUSTOMER;
        return new CardContext(unread, itemCounts, admin ? cardLines(ids) : Map.of(),
                admin ? exchangeChildren(ids) : Map.of());
    }

    /** original id → its exchange replacements (V69), one query per page. */
    private Map<String, List<String>> exchangeChildren(List<byte[]> orderIds) {
        Map<String, List<String>> out = new HashMap<>();
        for (Object[] row : orderRepository.exchangeChildren(orderIds)) {
            out.computeIfAbsent(UuidUtil.toString((byte[]) row[0]), k -> new ArrayList<>())
                    .add(UuidUtil.toString((byte[]) row[1]));
        }
        return out;
    }

    /**
     * Paid value of the units sent back and still on their way (the pending ones are the latest returned
     * units of the line). Skips the order's item list entirely when nothing is on the way.
     */
    private static long pendingReturnValueMinor(OrderItem it) {
        int pending = it.getReturnPendingQty();
        return pending <= 0 ? 0
                : OrderMoney.paidForUnitsMinor(it.getOrder(), it, it.getReturnedQty() - pending, pending);
    }

    /** The picture strip of the admin cards: every line with its first photo, two queries per page. */
    private Map<String, List<OrderCardDto.CardLine>> cardLines(List<byte[]> orderIds) {
        List<OrderItem> items = orderItemRepository.findByOrderIds(orderIds);
        Map<String, String> thumbnails = this.thumbnails.of(items);
        Map<String, List<OrderCardDto.CardLine>> out = new HashMap<>();
        for (OrderItem it : items) {
            String productId = it.getProductId() == null ? null : UuidUtil.toString(it.getProductId());
            out.computeIfAbsent(UuidUtil.toString(it.getOrder().getId()), k -> new ArrayList<>())
                    .add(new OrderCardDto.CardLine(productId == null ? null : thumbnails.get(productId),
                            it.getTitleSnapshot()
                                    + (it.getVariantNameSnapshot() == null ? "" : " · " + it.getVariantNameSnapshot()),
                            it.getQuantity(), it.getReturnPendingQty(), it.getReturnedQty(), it.isGift(),
                            pendingReturnValueMinor(it)));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public OrderSummaryDto toSummary(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        OrderPaymentState pay = OrderPaymentState.of(o);
        return OrderSummaryDto.builder()
                .id(id)
                .status(o.getStatus().name())
                .totalMinor(o.getTotalMinor())
                .currency(o.getCurrency())
                .createdAt(o.getCreatedAt())
                .itemsCount(ctx.itemsFor(id))
                .unreadCount(ctx.unreadFor(id))
                .paid(pay.paid())
                .receivedMinor(pay.receivedMinor())
                .paymentDueAt(pay.paymentDueAt())
                .amountDueMinor(pay.amountDueMinor())
                .cancelRequestStatus(o.getCancelRequestStatus())
                .giftCaseStatus(o.getGiftCaseStatus())
                .giftCaseOpenable(GiftCaseRules.giftCaseOpenable(o))
                .uncollectedMinor(pay.uncollectedMinor())
                .build();
    }

    @Transactional(readOnly = true)
    public OrderCardDto toCard(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        OrderPaymentState pay = OrderPaymentState.of(o);
        return OrderCardDto.builder()
                .id(id)
                .customerName(o.getCustomerName())
                .totalMinor(o.getTotalMinor())
                .currency(o.getCurrency())
                .itemsCount(ctx.itemsFor(id))
                .deliveryMethod(o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name())
                .paymentOptionTitle(o.getPaymentOptionTitle())
                .unreadCount(ctx.unreadFor(id))
                .createdAt(o.getCreatedAt())
                .status(o.getStatus().name())
                .paid(pay.paid())
                .receivedMinor(pay.receivedMinor())
                .paymentDueAt(pay.paymentDueAt())
                .amountDueMinor(pay.amountDueMinor())
                .source(sourceOf(o))
                .cancelRequestStatus(o.getCancelRequestStatus())
                .archived(o.getArchivedAt() != null)
                .returnStatus(o.getReturnStatus())
                .returningUnits(ctx.linesFor(id).stream().mapToInt(OrderCardDto.CardLine::returning).sum())
                .returnedUnits(ctx.linesFor(id).stream().mapToInt(OrderCardDto.CardLine::returned).sum())
                .lines(ctx.linesFor(id))
                .exchangeOfId(o.getExchangeOfOrderId() == null ? null : UuidUtil.toString(o.getExchangeOfOrderId()))
                .exchangeOrderIds(ctx.exchangesOf(id))
                .uncollectedMinor(pay.uncollectedMinor())
                .build();
    }

    static String sourceOf(Order o) {
        return o.getSource() == null ? "MINIAPP" : o.getSource().name();
    }

    /** Maps a whole page of orders, fetching the shared context once. */
    @Transactional(readOnly = true)
    public List<OrderCardDto> toCards(List<Order> orders, SenderType unreadFrom) {
        CardContext ctx = cardContext(orders, unreadFrom);
        return orders.stream().map(o -> toCard(o, ctx)).toList();
    }

    /** Same for the customer's order list. */
    @Transactional(readOnly = true)
    public List<OrderSummaryDto> toSummaries(List<Order> orders) {
        CardContext ctx = cardContext(orders, SenderType.ADMIN);
        return orders.stream().map(o -> toSummary(o, ctx)).toList();
    }

    /** Admin view: line titles are the Russian snapshots. */
    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o) {
        return detailView.adminView(attached(o));
    }

    /**
     * Customer view: a line shows the product's current translation for {@code lang} when there is
     * one, else the snapshot. {@code order_items.title_snapshot} itself stays Russian — the seller,
     * the dispatch list and the channel read it. The shop's own rejection reasons (cancelled by the
     * customer, payment window ran out) are worded in the request's language too.
     */
    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o, String lang) {
        return detailView.customerView(attached(o), lang);
    }

    /**
     * The order as part of this transaction. Callers hand over what an earlier transaction loaded or saved - that
     * instance is detached and its lines (lazy) cannot be read any more; inside a running transaction this is the
     * same managed instance and costs no query.
     */
    private Order attached(Order o) {
        return orderRepository.findById(o.getId()).orElse(o);
    }

    /** Rows of the «Объединить» window (V71). */
    public List<OrderDetailDto.MergeCandidateDto> mergeCandidates(List<OrderMerge.Candidate> found) {
        return found.stream().map(c -> {
            Order o = c.order();
            return OrderDetailDto.MergeCandidateDto.builder()
                    .id(UuidUtil.toString(o.getId()))
                    .status(o.getStatus().name())
                    .createdAt(o.getCreatedAt())
                    .totalMinor(o.getTotalMinor())
                    .receivedMinor(Math.max(0, o.getReceivedMinor()))
                    .prepaymentMinor(o.getPrepaymentMinor())
                    .paid(o.isPaid())
                    .paymentOptionTitle(o.getPaymentOptionTitle())
                    .npCityName(o.getNpCityName())
                    .npWarehouseName(o.getNpWarehouseName())
                    .customerName(o.getCustomerName())
                    .trackingNumber(o.getTrackingNumber())
                    .giftCaseStatus(o.getGiftCaseStatus())
                    .lines(o.getItems().stream()
                            .map(i -> i.getTitleSnapshot()
                                    + (i.getVariantNameSnapshot() == null ? "" : " (" + i.getVariantNameSnapshot() + ")")
                                    + " ×" + i.getQuantity() + (i.isGift() ? " · подарок" : ""))
                            .toList())
                    .blocker(c.blocker())
                    .mergedTotalMinor(c.totalMinor())
                    .mergedReceivedMinor(c.receivedMinor())
                    .mergedAmountDueMinor(c.amountDueMinor())
                    .mergedCodMinor(c.codMinor())
                    .build();
        }).toList();
    }

    /** Latest monobank invoice of the order, as the customer apps need it. */
    public OnlinePaymentDto onlinePayment(Order o) {
        return detailView.onlinePayment(o);
    }

    // expose for board grouping convenience
    public List<Order> byStatus(OrderStatus status) {
        return orderRepository.findByStatusOrderByCreatedAtDesc(status);
    }
}
