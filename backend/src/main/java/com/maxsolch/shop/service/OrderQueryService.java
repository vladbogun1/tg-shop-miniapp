package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.OrderMessageRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.repository.ProductImageRepository;
import com.maxsolch.shop.web.dto.DispatchOrderDto;
import com.maxsolch.shop.web.dto.OrderCardDto;
import com.maxsolch.shop.web.dto.OrderDetailDto;
import com.maxsolch.shop.web.dto.OrderItemDto;
import com.maxsolch.shop.web.dto.OrderSummaryDto;
import com.maxsolch.shop.web.dto.PaymentRequisitesDto;
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
    private final PaymentRequisitesRepository requisitesRepository;
    private final ProductImageRepository productImageRepository;

    public OrderQueryService(OrderRepository orderRepository,
                             OrderMessageRepository messageRepository,
                             OrderItemRepository orderItemRepository,
                             PaymentRequisitesRepository requisitesRepository,
                             ProductImageRepository productImageRepository) {
        this.orderRepository = orderRepository;
        this.messageRepository = messageRepository;
        this.orderItemRepository = orderItemRepository;
        this.requisitesRepository = requisitesRepository;
        this.productImageRepository = productImageRepository;
    }

    /**
     * Pre-fetched per-order numbers for a page of cards.
     *
     * @param unread     order id (UUID string) → unread messages from the other side
     * @param itemCounts order id (UUID string) → total units in the order
     */
    public record CardContext(Map<String, Long> unread, Map<String, Integer> itemCounts) {

        static CardContext empty() {
            return new CardContext(Map.of(), Map.of());
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
        return new CardContext(unread, itemCounts);
    }

    @Transactional(readOnly = true)
    public OrderSummaryDto toSummary(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        return new OrderSummaryDto(
                id,
                o.getStatus().name(),
                o.getTotalMinor(),
                o.getCurrency(),
                o.getCreatedAt(),
                ctx.itemsFor(id),
                ctx.unreadFor(id),
                o.isPaid(),
                o.isPaymentClaimed());
    }

    @Transactional(readOnly = true)
    public OrderCardDto toCard(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        return new OrderCardDto(
                id,
                o.getCustomerName(),
                o.getTotalMinor(),
                o.getCurrency(),
                ctx.itemsFor(id),
                o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name(),
                o.getPaymentOptionTitle(),
                ctx.unreadFor(id),
                o.getCreatedAt(),
                o.getStatus().name(),
                o.isPaid(),
                o.isPaymentClaimed());
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

    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o) {
        List<OrderItem> orderItems = o.getItems();
        Map<String, String> thumbnails = thumbnailsFor(orderItems);
        List<OrderItemDto> items = orderItems.stream()
                .map(it -> toItemDto(it, thumbnails))
                .toList();
        PaymentRequisitesDto requisites = requisitesRepository.findById(1)
                .map(this::toRequisitesDto)
                .orElse(null);
        return new OrderDetailDto(
                UuidUtil.toString(o.getId()),
                o.getStatus().name(),
                o.getSubtotalMinor(),
                o.getDiscountMinor(),
                o.getTotalMinor(),
                o.getCurrency(),
                o.getCustomerName(),
                o.getPhone(),
                o.getComment(),
                o.getPromoCode(),
                o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name(),
                o.getNpCityName(),
                o.getNpWarehouseName(),
                o.getPaymentOptionTitle(),
                o.getTrackingNumber(),
                o.getRejectReason(),
                items,
                requisites,
                o.getTgUserId(),
                o.getTgUsername(),
                o.getCreatedAt(),
                o.getApprovedAt(),
                o.getShippedAt(),
                o.getDeliveredAt(),
                o.getRejectedAt(),
                o.isPaid(),
                o.getPaidAt(),
                o.getPrepaymentMinor(),
                receivedMinor(o),
                o.isPaymentClaimed(),
                o.getPaymentClaimedAt());
    }

    /** Exact amount actually received for the order (admin "mark paid" dialog / customer proof). */
    public static long receivedMinor(Order o) {
        return Math.min(Math.max(0, o.getReceivedMinor()), o.getTotalMinor());
    }

    /** Cash-on-delivery (наложка) to collect at Nova Poshta. */
    public static long codMinor(Order o) {
        return Math.max(0, o.getTotalMinor() - receivedMinor(o));
    }

    /** All APPROVED orders mapped to dispatch rows (newest first). */
    @Transactional(readOnly = true)
    public List<DispatchOrderDto> dispatchList() {
        return orderRepository.findByStatusOrderByCreatedAtDesc(OrderStatus.APPROVED).stream()
                .map(this::toDispatch)
                .toList();
    }

    @Transactional(readOnly = true)
    public DispatchOrderDto toDispatch(Order o) {
        long received = receivedMinor(o);
        long cod = codMinor(o);
        List<DispatchOrderDto.DispatchItem> items = o.getItems().stream()
                .map(it -> new DispatchOrderDto.DispatchItem(
                        it.getTitleSnapshot(), it.getVariantNameSnapshot(),
                        it.getQuantity(), it.getPriceMinorSnapshot()))
                .toList();
        String shortId = UuidUtil.toString(o.getId());
        if (shortId != null && shortId.length() >= 8) {
            shortId = shortId.substring(0, 8);
        }
        return new DispatchOrderDto(
                UuidUtil.toString(o.getId()),
                shortId,
                o.getCustomerName(),
                o.getPhone(),
                o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name(),
                o.getNpCityName(),
                o.getNpWarehouseName(),
                items,
                o.getTotalMinor(),
                o.getPrepaymentMinor(),
                received,
                cod,
                o.isPaid(),
                o.isPaymentClaimed(),
                o.getCurrency(),
                o.getPaymentOptionTitle(),
                o.getTrackingNumber(),
                o.getCreatedAt(),
                o.getApprovedAt());
    }

    /** One query for all the line thumbnails instead of one per line. */
    private Map<String, String> thumbnailsFor(List<OrderItem> items) {
        List<byte[]> productIds = new ArrayList<>();
        for (OrderItem it : items) {
            if (it.getProductId() != null) {
                productIds.add(it.getProductId());
            }
        }
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<String, String> first = new HashMap<>();
        for (ProductImage image : productImageRepository.findForProducts(productIds)) {
            // Results are ordered by sortOrder, so the first one seen per product wins.
            first.putIfAbsent(UuidUtil.toString(image.getProduct().getId()), image.getUrl());
        }
        return first;
    }

    private OrderItemDto toItemDto(OrderItem it, Map<String, String> thumbnails) {
        String productId = it.getProductId() == null ? null : UuidUtil.toString(it.getProductId());
        return new OrderItemDto(
                it.getId(),
                productId,
                it.getTitleSnapshot(),
                it.getPriceMinorSnapshot(),
                it.getVariantId() == null ? null : UuidUtil.toString(it.getVariantId()),
                it.getVariantNameSnapshot(),
                it.getQuantity(),
                productId == null ? null : thumbnails.get(productId),
                it.isGift());
    }

    private PaymentRequisitesDto toRequisitesDto(PaymentRequisites r) {
        return new PaymentRequisitesDto(
                r.getCardNumber(), r.getIban(), r.getRecipient(),
                r.getEdrpou(), r.getPurpose(), r.getNote());
    }

    // expose for board grouping convenience
    public List<Order> byStatus(OrderStatus status) {
        return orderRepository.findByStatusOrderByCreatedAtDesc(status);
    }
}
